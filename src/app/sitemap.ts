import type { MetadataRoute } from "next";

import { listPublicArchives, listPublishedPosts } from "@/features/posts/data";
import { buildSitemap } from "@/features/seo/sitemap";
import { getSiteSettings } from "@/features/site-settings/data";
import { getConfiguredSiteUrl } from "@/lib/site-url";

// Cached like the public pages: its Supabase reads carry publicPostsCacheTag,
// and publication Server Actions expire that tag and revalidate this route;
// a settings save (indexing toggle) regenerates it with every other route.
// The interval is a fallback for out-of-band database changes.
export const revalidate = 300;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const [posts, archives, site] = await Promise.all([
    listPublishedPosts(),
    listPublicArchives(),
    getSiteSettings(),
  ]);
  return buildSitemap({
    siteUrl: getConfiguredSiteUrl(),
    indexing: site.searchIndexing,
    posts,
    archives,
  });
}
