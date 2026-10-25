import type { MetadataRoute } from "next";

import { buildRobots } from "@/features/seo/sitemap";
import { getSiteSettings } from "@/features/site-settings/data";
import { getConfiguredSiteUrl } from "@/lib/site-url";

// Reads the indexing toggle from the site settings, so it is ISR like the
// sitemap; a settings save regenerates it (src/features/site-settings/cache.ts).
export const revalidate = 300;

export default async function robots(): Promise<MetadataRoute.Robots> {
  const site = await getSiteSettings();
  return buildRobots(getConfiguredSiteUrl(), site.searchIndexing);
}
