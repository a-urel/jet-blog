import { listLatestPublishedPosts } from "@/features/posts/data";
import { feedNotFound, feedResponse } from "@/features/seo/archive-feed";
import { buildAtomFeed, feedPostLimit } from "@/features/seo/feed";
import { getConfiguredSiteUrl, getSiteName } from "@/lib/site-url";

// Cached like sitemap.xml: the Supabase read carries publicPostsCacheTag, and
// publication Server Actions expire that tag and revalidate this route
// (src/features/posts/cache.ts). The interval is a fallback for out-of-band
// database changes. Archive feeds (src/app/<archive>/[slug]/feed.xml) share
// the builder and the responses.
export const revalidate = 300;

export async function GET() {
  // Without a site origin there is no valid feed (feedNotFound).
  const siteUrl = getConfiguredSiteUrl();
  if (!siteUrl) return feedNotFound();

  const posts = await listLatestPublishedPosts(feedPostLimit);
  return feedResponse(buildAtomFeed({ siteUrl, siteName: getSiteName(), posts }));
}
