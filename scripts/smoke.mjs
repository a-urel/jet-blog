// End-to-end smoke test against a running server (normally `npm start`):
//
//   SMOKE_BASE_URL=http://localhost:3000 npm run test:smoke
//
// Anonymous HTTP checks only: public pages render, unknown and draft URLs
// return 404, admin and reader routes redirect to sign-in, discovery files exist, and every
// response carries the security headers. It needs no credentials and changes
// no data, so it can also run against a staging deployment.

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
  checkSecurityHeaders(postPath, post);
} else {
  console.warn("No published post on the home page; post checks skipped.");
}

for (const path of ["/posts/smoke-missing-post", "/tags/smoke-missing-tag"]) {
  const response = await get(path);
  const html = await response.text();

  check(response.status === 404, `${path}: expected 404, got ${response.status}`);
  check(html.includes("noindex"), `${path}: 404 page is indexable`);
}

const admin = await get("/admin");
check(
  [302, 303, 307, 308].includes(admin.status) &&
    new URL(admin.headers.get("location") ?? "", baseUrl).pathname === "/login",
  `/admin: anonymous request was not redirected to /login (status ${admin.status})`,
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

const robots = await get("/robots.txt");
check(robots.status === 200, `/robots.txt: expected 200, got ${robots.status}`);
check((await robots.text()).includes("/admin"), "/robots.txt: /admin is not disallowed");

const sitemap = await get("/sitemap.xml");
const sitemapXml = await sitemap.text();
check(sitemap.status === 200, `/sitemap.xml: expected 200, got ${sitemap.status}`);
check(!sitemapXml.includes("/admin"), "/sitemap.xml: lists an admin URL");

if (failures.length > 0) {
  console.error(`Smoke test failed against ${baseUrl}:`);
  for (const failure of failures) console.error(`  - ${failure}`);
  process.exit(1);
}

console.log(`Smoke test passed against ${baseUrl}.`);
