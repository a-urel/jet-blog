import type { MetadataRoute } from "next";

import { buildRobots } from "@/features/seo/sitemap";
import { getConfiguredSiteUrl } from "@/lib/site-url";

export default function robots(): MetadataRoute.Robots {
  return buildRobots(getConfiguredSiteUrl());
}
