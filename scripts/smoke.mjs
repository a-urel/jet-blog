// End-to-end smoke test against a running server (normally `npm start`):
//
//   SMOKE_BASE_URL=http://localhost:3000 npm run test:smoke
//
// Anonymous HTTP checks only: public pages render, unknown and draft URLs
// return 404, listing pages paginate (page 1 has one URL, invalid and
// out-of-range pages return 404), admin and reader routes redirect to sign-in,
// discovery files and the Atom feed exist, search answers dynamically with
// noindex and links only public posts, social images are declared, and every response carries the security headers. It needs no credentials and changes
// no data (a few searches count against this client's search rate limit), so it can also run against a staging deployment.
//
// Optional: SMOKE_SUPABASE_URL and SMOKE_SUPABASE_PUBLISHABLE_KEY (the public
// values the site itself uses) also check that clients cannot call the search
// function directly through the Data API.

const baseUrl = (process.env.SMOKE_BASE_URL ?? "http://localhost:3000").replace(/\/+$/, "");
const failures = [];

function check(condition, message) {
  if (!condition) failures.push(message);
}

async function get(path) {
  return fetch(`${baseUrl}${path}`, { redirect: "manual" });
}

function checkSecurityHeaders(path, response) {
  const csp = response.headers.get("content-security-policy") ?? "";

  check(csp.includes("frame-ancestors 'none'"), `${path}: CSP missing frame-ancestors`);
  check(
    csp.includes("frame-src https://www.youtube-nocookie.com"),
    `${path}: CSP does not allow only YouTube nocookie frames`,
  );
  check(!csp.includes("'unsafe-eval'"), `${path}: CSP allows eval (development build?)`);
  check(
    response.headers.get("x-content-type-options") === "nosniff",
    `${path}: missing X-Content-Type-Options`,
  );
  check(!response.headers.has("x-powered-by"), `${path}: X-Powered-By is exposed`);
}

const home = await get("/");
const homeHtml = await home.text();
check(home.status === 200, `/: expected 200, got ${home.status}`);
checkSecurityHeaders("/", home);

// Follow the first post link from the listing, if any posts are published.
const postPath = homeHtml.match(/href="(\/posts\/[a-z0-9-]+)"/)?.[1];

if (postPath) {
  const post = await get(postPath);
  const postHtml = await post.text();

  check(post.status === 200, `${postPath}: expected 200, got ${post.status}`);
  check(postHtml.includes('"@type":"BlogPosting"'), `${postPath}: missing Article JSON-LD`);
  // With a site origin every public post shares an image: its cover or the
  // site-wide generated one.
  if (/<link rel="canonical" href="https?:/.test(postHtml)) {
    check(/<meta property="og:image" content="https?:/.test(postHtml), `${postPath}: missing og:image`);
    check(
      postHtml.includes('<meta name="twitter:card" content="summary_large_image"'),
      `${postPath}: Twitter card is not summary_large_image`,
    );
  }
  // Visible comments are server-rendered into the shared page.
  check(postHtml.includes('id="comments-heading"'), `${postPath}: comments are not server-rendered`);
  check(
    !(post.headers.get("cache-control") ?? "").includes("private"),
    `${postPath}: post page is not publicly cacheable`,
  );
  checkSecurityHeaders(postPath, post);
} else {
  console.warn("No published post on the home page; post checks skipped.");
}

function canonicalOf(html) {
  const href = html.match(/<link rel="canonical" href="([^"]+)"/)?.[1];
  return href ? new URL(href, baseUrl).pathname : null;
}

check(canonicalOf(homeHtml) === "/", `/: canonical is ${canonicalOf(homeHtml)}, expected /`);

// Page 1 of a listing has a single URL.
const firstPage = await get("/page/1");
check(
  [301, 308].includes(firstPage.status) &&
    new URL(firstPage.headers.get("location") ?? "", baseUrl).pathname === "/",
  `/page/1: expected a permanent redirect to /, got ${firstPage.status}`,
);

// Page 2 exists only with more published posts than one page holds.
if (homeHtml.includes('href="/page/2"')) {
  const second = await get("/page/2");
  const secondHtml = await second.text();

  check(second.status === 200, `/page/2: expected 200, got ${second.status}`);
  check(
    canonicalOf(secondHtml) === "/page/2",
    `/page/2: canonical is ${canonicalOf(secondHtml)}, expected /page/2`,
  );
  check(!secondHtml.includes("noindex"), "/page/2: listing page is not indexable");
  check(secondHtml.includes('aria-current="page"'), "/page/2: no current page in pagination");
  check(
    !(second.headers.get("cache-control") ?? "").includes("private"),
    "/page/2: listing page is not publicly cacheable",
  );
  checkSecurityHeaders("/page/2", second);
} else {
  console.warn("The home listing has a single page; page 2 checks skipped.");
}

for (const path of [
  "/posts/smoke-missing-post",
  "/tags/smoke-missing-tag",
  "/tags/smoke-missing-tag/page/2",
  "/page/0",
  "/page/02",
  "/page/not-a-number",
  // Past the end of any realistic listing.
  "/page/99999",
]) {
  const response = await get(path);
  const html = await response.text();

  check(response.status === 404, `${path}: expected 404, got ${response.status}`);
  check(html.includes("noindex"), `${path}: 404 page is indexable`);
}

// Admin routes redirect to sign-in with their path (and query) as ?next=.
for (const path of ["/admin", "/admin/comments?filter=hidden"]) {
  const response = await get(path);
  const location = new URL(response.headers.get("location") ?? "", baseUrl);
  check(
    [302, 303, 307, 308].includes(response.status) &&
      location.pathname === "/login" &&
      location.searchParams.get("next") === path,
    `${path}: anonymous request was not redirected to /login?next= (status ${response.status}, ${location.pathname}${location.search})`,
  );
}

// An external ?next= is ignored: sign-in offers no return path for it.
const offsite = await get(`/login?next=${encodeURIComponent("//evil.example/admin")}`);
check(
  offsite.status === 200 && !(await offsite.text()).includes("kaldığınız sayfaya"),
  "/login?next=//evil.example: an external return path was accepted",
);

// Reader routes redirect to sign-in with a return path and are never cached.
const saved = await get("/account/saved");
const savedLocation = new URL(saved.headers.get("location") ?? "", baseUrl);
check(
  [302, 303, 307, 308].includes(saved.status) &&
    savedLocation.pathname === "/login" &&
    savedLocation.searchParams.get("next") === "/account/saved",
  `/account/saved: anonymous request was not redirected to /login?next= (status ${saved.status})`,
);

// Public pages stay shared, cacheable output: bookmark state loads in the
// browser, so no per-user cookie may turn them private.
check(
  !(home.headers.get("cache-control") ?? "").includes("private"),
  "/: public page is not publicly cacheable",
);

// The site-wide social image is generated once at build time.
const socialImage = await get("/opengraph-image");
check(socialImage.status === 200, `/opengraph-image: expected 200, got ${socialImage.status}`);
check(
  (socialImage.headers.get("content-type") ?? "").startsWith("image/png"),
  `/opengraph-image: unexpected content type ${socialImage.headers.get("content-type")}`,
);
await socialImage.arrayBuffer();
if (/<link rel="canonical" href="https?:/.test(homeHtml)) {
  check(
    /<meta property="og:image" content="https?:\/\/[^"]+\/opengraph-image/.test(homeHtml),
    "/: missing the site-wide og:image",
  );
}

const robots = await get("/robots.txt");
check(robots.status === 200, `/robots.txt: expected 200, got ${robots.status}`);
check((await robots.text()).includes("/admin"), "/robots.txt: /admin is not disallowed");

const sitemap = await get("/sitemap.xml");
const sitemapXml = await sitemap.text();
check(sitemap.status === 200, `/sitemap.xml: expected 200, got ${sitemap.status}`);
check(!sitemapXml.includes("/admin"), "/sitemap.xml: lists an admin URL");

// The Atom feed exists only with a configured site origin (absolute URLs);
// without one it answers 404 and no discovery link is rendered.
const feedLink = homeHtml.match(
  /<link rel="alternate" type="application\/atom\+xml"[^>]*href="([^"]+)"/,
)?.[1];
const feed = await get("/feed.xml");
const feedXml = await feed.text();

if (feedLink) {
  check(
    new URL(feedLink, baseUrl).pathname === "/feed.xml",
    `/: feed discovery link points to ${feedLink}`,
  );
  check(feed.status === 200, `/feed.xml: expected 200, got ${feed.status}`);
  check(
    (feed.headers.get("content-type") ?? "").startsWith("application/atom+xml"),
    `/feed.xml: unexpected content type ${feed.headers.get("content-type")}`,
  );
  check(
    feedXml.includes('<feed xmlns="http://www.w3.org/2005/Atom"'),
    "/feed.xml: not an Atom feed",
  );
  check(!/\/(admin|login|auth)[/"<]|preview/.test(feedXml), "/feed.xml: links a private URL");
  check(
    !(feed.headers.get("cache-control") ?? "").includes("private"),
    "/feed.xml: feed is not publicly cacheable",
  );
  if (postPath) {
    check(feedXml.includes(`${postPath}"`), `/feed.xml: newest post ${postPath} is missing`);
  }
  checkSecurityHeaders("/feed.xml", feed);
} else {
  check(feed.status === 404, `/feed.xml: expected 404 without a discovery link, got ${feed.status}`);
  console.warn("No feed discovery link (NEXT_PUBLIC_SITE_URL unset?); feed content checks skipped.");
}

// Search: dynamic, noindex, never shared-cached, and never links a post that
// is not public. The header form is on every page.
check(
  /<form[^>]*role="search"[^>]*action="\/search"|<form[^>]*action="\/search"[^>]*role="search"/.test(homeHtml),
  "/: header search form is missing",
);
check(!sitemapXml.includes("/search"), "/sitemap.xml: lists the search page");

async function getSearch(query) {
  const path = `/search?q=${encodeURIComponent(query)}`;
  const response = await get(path);
  const html = await response.text();

  check(response.status === 200, `${path}: expected 200, got ${response.status}`);
  check(html.includes("noindex"), `${path}: search page is indexable`);
  check(
    /private|no-store/.test(response.headers.get("cache-control") ?? ""),
    `${path}: search page is publicly cacheable (${response.headers.get("cache-control")})`,
  );
  check(!html.includes("Çok fazla arama"), `${path}: search rate limit hit during the smoke test`);
  checkSecurityHeaders(path, response);
  return { path, html };
}

const emptySearch = await getSearch("");
check(emptySearch.html.includes('name="q"'), "/search: search form is missing");

const shortSearch = await getSearch("a");
check(shortSearch.html.includes("en az 2 karakter"), "/search?q=a: too-short state is missing");

const noResult = await getSearch("smokeyokboylebirsozcuk");
check(noResult.html.includes("sonuç bulunamadı"), "/search: no-result state is missing");

// Every post a search links must be public (a draft would answer 404).
async function checkSearchLinks({ path, html }) {
  const links = [...new Set([...html.matchAll(/href="(\/posts\/[a-z0-9-]+)"/g)].map((match) => match[1]))];
  for (const link of links) {
    const response = await get(link);
    await response.arrayBuffer();
    check(response.status === 200, `${path}: links ${link}, which answers ${response.status}`);
  }
  return links;
}

if (postPath) {
  // The slug is derived from the title, so its first word finds the post
  // (accent-folded matching covers Turkish characters).
  const term = postPath.split("/").pop().split("-")[0];
  const found = await getSearch(term);
  const links = await checkSearchLinks(found);
  check(links.includes(postPath), `${found.path}: ${postPath} is not among the results`);
}

// The synthetic seed has a draft titled "Yayına hazırlanan taslak".
const draftSearch = await getSearch("taslak");
await checkSearchLinks(draftSearch);
check(
  !draftSearch.html.includes("/posts/taslak-yazi-ornegi"),
  "/search?q=taslak: the seed draft is listed",
);

// Direct Data API calls to the search function bypass the page's rate limit,
// so the database refuses them for client keys.
const supabaseUrl = process.env.SMOKE_SUPABASE_URL?.replace(/\/+$/, "");
const publishableKey = process.env.SMOKE_SUPABASE_PUBLISHABLE_KEY;
if (supabaseUrl && publishableKey) {
  const direct = await fetch(`${supabaseUrl}/rest/v1/rpc/search_published_posts`, {
    method: "POST",
    headers: {
      apikey: publishableKey,
      "content-type": "application/json",
    },
    body: JSON.stringify({ p_query: "smoke", p_language: null, p_limit: 1, p_offset: 0 }),
  });
  await direct.arrayBuffer();
  check(
    [401, 403, 404].includes(direct.status),
    `rpc/search_published_posts: a client key can call search directly (status ${direct.status})`,
  );
} else {
  console.warn("SMOKE_SUPABASE_URL or SMOKE_SUPABASE_PUBLISHABLE_KEY unset; direct search RPC check skipped.");
}

if (failures.length > 0) {
  console.error(`Smoke test failed against ${baseUrl}:`);
  for (const failure of failures) console.error(`  - ${failure}`);
  process.exit(1);
}

console.log(`Smoke test passed against ${baseUrl}.`);
