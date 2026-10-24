import { listPublicArchives } from "@/features/posts/data";
import { archiveFeedResponse } from "@/features/seo/archive-feed";

// The tag archive's Atom feed, outside the [locale] segment like
// /feed.xml (src/proxy.ts skips paths with an extension). Same cache contract:
// tagged anonymous reads, revalidated with the archives (src/features/posts/cache.ts).
export const revalidate = 300;

export async function generateStaticParams() {
  return (await listPublicArchives()).tags.map(({ slug }) => ({ slug }));
}

export async function GET(_request: Request, { params }: RouteContext<"/tags/[slug]/feed.xml">) {
  return archiveFeedResponse("tag", (await params).slug);
}
