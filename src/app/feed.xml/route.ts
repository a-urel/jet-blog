import { listLatestPublishedPosts } from "@/features/posts/data";
import { buildAtomFeed, feedContentType, feedPostLimit } from "@/features/seo/feed";
import { getConfiguredSiteUrl, getSiteName } from "@/lib/site-url";

// Cached like sitemap.xml: the Supabase read carries publicPostsCacheTag, and
// publication Server Actions expire that tag and revalidate this route
// (src/features/posts/cache.ts). The interval is a fallback for out-of-band
// database changes.
export const revalidate = 300;

export async function GET() {
  // Entry ids, links, and the self link need absolute URLs. Without a site
  // origin there is no valid feed, so the route answers 404 (robots.txt also
  // disallows everything then).
  const siteUrl = getConfiguredSiteUrl();
  if (!siteUrl) {
    return new Response("Not Found", {
      status: 404,
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    });
  }

  const posts = await listLatestPublishedPosts(feedPostLimit);
  const xml = buildAtomFeed({ siteUrl, siteName: getSiteName(), posts });

  return new Response(xml, {
    headers: { "Content-Type": `${feedContentType}; charset=utf-8` },
  });
}
