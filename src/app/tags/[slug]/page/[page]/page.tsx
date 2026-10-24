import type { Metadata } from "next";
import { notFound, permanentRedirect } from "next/navigation";

import { archivePaths } from "@/features/posts/archives";
import { listPublicArchives } from "@/features/posts/data";
import { laterPageParams, parsePageParam } from "@/features/posts/pagination";
import { noIndexMetadata } from "@/features/seo/metadata";
import { TagArchive, tagArchiveMetadata } from "../../tag-archive";

// Later pages of a tag archive; same cache contract as /tags/[slug].
// /tags/[slug]/page/1 redirects to /tags/[slug].
export const revalidate = 300;

export async function generateStaticParams() {
  return (await listPublicArchives()).tags.flatMap(({ slug, postCount }) =>
    laterPageParams(postCount).map(({ page }) => ({ slug, page })),
  );
}

export async function generateMetadata({
  params,
}: PageProps<"/tags/[slug]/page/[page]">): Promise<Metadata> {
  const { slug, page: pageParam } = await params;
  const page = parsePageParam(pageParam);
  return page === null || page === 1 ? noIndexMetadata : tagArchiveMetadata(slug, page);
}

export default async function TagArchiveLaterPage({
  params,
}: PageProps<"/tags/[slug]/page/[page]">) {
  const { slug, page: pageParam } = await params;
  const page = parsePageParam(pageParam);
  if (page === null) notFound();
  if (page === 1) permanentRedirect(archivePaths.tag(slug));

  return <TagArchive slug={slug} page={page} />;
}
