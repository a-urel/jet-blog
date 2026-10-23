import type { MetadataRoute } from "next";

import { listPublicArchives, listPublishedPosts } from "@/features/posts/data";
import { buildSitemap } from "@/features/seo/sitemap";
import { getConfiguredSiteUrl } from "@/lib/site-url";

// Cached like the public pages: its Supabase reads carry publicPostsCacheTag,
// and publication Server Actions expire that tag and revalidate this route.
// The interval is a fallback for out-of-band database changes.
export const revalidate = 300;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const [posts, archives] = await Promise.all([listPublishedPosts(), listPublicArchives()]);
  return buildSitemap({ siteUrl: getConfiguredSiteUrl(), posts, archives });
}
