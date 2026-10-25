// End-to-end smoke test against a running server (normally `npm start`):
//
//   SMOKE_BASE_URL=http://localhost:3000 npm run test:smoke
//
// Anonymous HTTP checks only: public pages render, unknown and draft URLs
// return 404, listing pages paginate (page 1 has one URL, invalid and
// out-of-range pages return 404), admin and reader routes redirect to sign-in,
// discovery files and the Atom feed exist, search answers dynamically with
// noindex and links only public posts, social images are declared, the
// interface locale follows the locale cookie and Accept-Language without
// changing any URL, and every response carries the security headers. It needs no credentials and changes
// no data (a few searches count against this client's search rate limit), so it can also run against a staging deployment.
//
// Optional: SMOKE_SUPABASE_URL and SMOKE_SUPABASE_PUBLISHABLE_KEY (the public
// values the site itself uses) also check that clients cannot call the search
// function directly through the Data API.

import { readFileSync } from "node:fs";

const baseUrl = (process.env.SMOKE_BASE_URL ?? "http://localhost:3000").replace(/\/+$/, "");
const failures = [];

// The skip link opens every page, so it identifies the interface language.
function commonMessages(locale) {
  return JSON.parse(readFileSync(new URL(`../src/messages/${locale}/common.json`, import.meta.url), "utf8"));
}

function check(condition, message) {
  if (!condition) failures.push(message);
}

async function get(path, headers = {}) {
  return fetch(`${baseUrl}${path}`, { redirect: "manual", headers });
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

  // The post language (any canonical BCP 47 tag) marks the content, and
  // og:locale, when present, is its language_TERRITORY form.
  const inLanguage = postHtml.match(/"inLanguage":"([^"]+)"/)?.[1];
  check(Boolean(inLanguage), `${postPath}: JSON-LD has no inLanguage`);
  if (inLanguage) {
    check(postHtml.includes(`lang="${inLanguage}"`), `${postPath}: content is not marked lang="${inLanguage}"`);
    const ogLocale = postHtml.match(/<meta property="og:locale" content="([^"]+)"/)?.[1];
    if (ogLocale) {
      check(
        ogLocale.startsWith(`${inLanguage.split("-")[0]}_`) && /^[a-z]{2,3}_[A-Z]{2}$/.test(ogLocale),
        `${postPath}: og:locale ${ogLocale} does not match ${inLanguage}`,
      );
    }
  }
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

// The generated site-wide social image (ISR, from the site settings).
const socialImage = await get("/opengraph-image");
check(socialImage.status === 200, `/opengraph-image: expected 200, got ${socialImage.status}`);
check(
  (socialImage.headers.get("content-type") ?? "").startsWith("image/png"),
  `/opengraph-image: unexpected content type ${socialImage.headers.get("content-type")}`,
);
await socialImage.arrayBuffer();
if (/<link rel="canonical" href="https?:/.test(homeHtml)) {
  check(
    // The generated image, or the default image chosen in the site settings.
    /<meta property="og:image" content="https?:\/\/[^"]+\/(opengraph-image|storage\/v1\/object\/public\/media\/)/.test(
      homeHtml,
    ),
    "/: missing the site-wide og:image",
  );
}

// App icons generated from the site settings, declared by the root layout.
for (const path of ["/site-icon.png", "/apple-touch-icon.png"]) {
  const icon = await get(path);
  check(icon.status === 200, `${path}: expected 200, got ${icon.status}`);
  check(
    (icon.headers.get("content-type") ?? "").startsWith("image/png"),
    `${path}: unexpected content type ${icon.headers.get("content-type")}`,
  );
  await icon.arrayBuffer();
}
check(/<link rel="icon" href="\/site-icon\.png\?v=\d+"/.test(homeHtml), "/: missing the site icon link");

// /admin is disallowed, or everything is (no site origin, or indexing turned
// off in the site settings).
const robots = await get("/robots.txt");
const robotsText = await robots.text();
check(robots.status === 200, `/robots.txt: expected 200, got ${robots.status}`);
check(
  robotsText.includes("/admin") || /Disallow: \/\s*$/m.test(robotsText),
  "/robots.txt: /admin is not disallowed",
);

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

// An invalid language filter falls back to all languages instead of failing.
const invalidLanguage = await get("/search?q=smoke&language=fr_FR");
const invalidLanguageHtml = await invalidLanguage.text();
check(invalidLanguage.status === 200, `/search?language=fr_FR: expected 200, got ${invalidLanguage.status}`);
// The filter has no control on the page, so check the result line: a filtered
// search names the language in parentheses, an unfiltered one does not.
check(
  /için (?:sonuç bulunamadı|\d+ sonuç)/.test(invalidLanguageHtml) &&
    !/için (?:sonuç bulunamadı|\d+ sonuç) \(/.test(invalidLanguageHtml),
  "/search?language=fr_FR: the invalid filter is not reset to all languages",
);

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

// Interface locale: chosen by the locale cookie, then Accept-Language, then
// Turkish. The URL, canonical, and post content language never change.
function htmlLang(html) {
  return html.match(/<html[^>]*\slang="([^"]+)"/)?.[1] ?? null;
}

check(htmlLang(homeHtml) === "tr", `/: anonymous default <html lang> is ${htmlLang(homeHtml)}, expected tr`);
check(homeHtml.includes(commonMessages("tr").layout.skipToContent), "/: default page is not in Turkish");

for (const [label, headers, expected] of [
  ["Cookie: locale=en", { cookie: "locale=en" }, "en"],
  ["Cookie: locale=de", { cookie: "locale=de" }, "de"],
  ["Accept-Language: de-AT", { "accept-language": "de-AT,de;q=0.9" }, "de"],
  ["cookie wins over Accept-Language", { cookie: "locale=en", "accept-language": "de" }, "en"],
  ["invalid cookie", { cookie: "locale=xx" }, "tr"],
]) {
  for (const path of ["/", ...(postPath ? [postPath] : [])]) {
    const response = await get(path, headers);
    const html = await response.text();
    check(response.status === 200, `${path} (${label}): expected 200, got ${response.status}`);
    check(htmlLang(html) === expected, `${path} (${label}): <html lang> is ${htmlLang(html)}, expected ${expected}`);
    check(
      html.includes(commonMessages(expected).layout.skipToContent),
      `${path} (${label}): interface text is not in ${expected}`,
    );
    check(canonicalOf(html) === path, `${path} (${label}): canonical is ${canonicalOf(html)}, expected ${path}`);
    check(
      !(response.headers.get("cache-control") ?? "").includes("private"),
      `${path} (${label}): public page is not publicly cacheable`,
    );
  }
}

if (postPath) {
  // Each locale's copy comes from the ISR cache, not a per-request render.
  for (const locale of ["tr", "en", "de"]) {
    const first = await get(postPath, { cookie: `locale=${locale}` });
    await first.arrayBuffer();
    const second = await get(postPath, { cookie: `locale=${locale}` });
    await second.arrayBuffer();
    check(
      /^(HIT|STALE)$/.test(second.headers.get("x-nextjs-cache") ?? ""),
      `${postPath} (locale=${locale}): x-nextjs-cache is ${second.headers.get("x-nextjs-cache")}, expected HIT`,
    );
  }
}

// The internal [locale] segment is not a public URL.
for (const path of ["/en", "/de/search", ...(postPath ? [`/en${postPath}`] : [])]) {
  const response = await get(path);
  await response.arrayBuffer();
  check(response.status === 404, `${path}: internal locale path answered ${response.status}, expected 404`);
}

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
