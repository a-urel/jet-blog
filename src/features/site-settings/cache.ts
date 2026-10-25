// Cache model for site settings (Phase 27). Sibling of
// src/features/posts/cache.ts, which describes the content caches.
//
// Every public route renders from the settings: the root layout (title
// template, description, Open Graph and Twitter defaults, robots, icons,
// accent color, header brand, footer, language switcher), JSON-LD, the Atom
// feeds (titles, subtitle, publisher, xml:lang), sitemap.xml and robots.txt
// (indexing toggle), the icon routes, and the generated social image. Pages
// stay SSG/ISR: getSiteSettings() reads the row through the anonymous client
// with siteSettingsCacheTag on the fetch, so a prerendered route keeps it in
// the Data Cache with that route's `revalidate` (300 s fallback), and React
// cache() shares one read per render.
//
// A settings save is rare and changes the whole site, so it invalidates
// everything rather than a route list:
//   1. updateTag(siteSettingsCacheTag): regenerated routes wait for the new
//      row instead of a stale Data Cache entry;
//   2. revalidatePath("/", "layout"): every cached page, Route Handler, and
//      metadata route sits below the root segment, whose layout tag each of
//      their cache entries carries, so one call regenerates all of them in
//      every locale (pages under src/app/[locale] and the unlocalized feeds,
//      sitemap, robots, icons, and social image alike).
//
// src/proxy.ts cannot use the Data Cache. It reads the locale fields with its
// own in-memory copy (src/features/site-settings/proxy-locales.ts) that lives
// at most proxyLocaleTtlMs per server instance, so a new default or enabled
// locale set reaches locale negotiation within that window.

export const siteSettingsCacheTag = "site-settings";

export type SiteSettingsInvalidation = {
  tags: string[];
  routes: { path: string; type: "layout" }[];
};

export function siteSettingsInvalidation(): SiteSettingsInvalidation {
  return { tags: [siteSettingsCacheTag], routes: [{ path: "/", type: "layout" }] };
}

export const proxyLocaleTtlMs = 30_000;
