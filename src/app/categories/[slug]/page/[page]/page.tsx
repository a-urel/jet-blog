import type { Metadata } from "next";
import { notFound, permanentRedirect } from "next/navigation";

import { archivePaths } from "@/features/posts/archives";
import { listPublicArchives } from "@/features/posts/data";
import { laterPageParams, parsePageParam } from "@/features/posts/pagination";
import { noIndexMetadata } from "@/features/seo/metadata";
import { CategoryArchive, categoryArchiveMetadata } from "../../category-archive";

// Later pages of a category archive; same cache contract as /categories/[slug].
// /categories/[slug]/page/1 redirects to /categories/[slug].
export const revalidate = 300;

export async function generateStaticParams() {
  return (await listPublicArchives()).categories.flatMap(({ slug, postCount }) =>
    laterPageParams(postCount).map(({ page }) => ({ slug, page })),
  );
}

export async function generateMetadata({
  params,
}: PageProps<"/categories/[slug]/page/[page]">): Promise<Metadata> {
  const { slug, page: pageParam } = await params;
  const page = parsePageParam(pageParam);
  return page === null || page === 1 ? noIndexMetadata : categoryArchiveMetadata(slug, page);
}

export default async function CategoryArchiveLaterPage({
  params,
}: PageProps<"/categories/[slug]/page/[page]">) {
  const { slug, page: pageParam } = await params;
  const page = parsePageParam(pageParam);
  if (page === null) notFound();
  if (page === 1) permanentRedirect(archivePaths.category(slug));

  return <CategoryArchive slug={slug} page={page} />;
}
