import type { Metadata } from "next";
import { notFound, permanentRedirect } from "next/navigation";

import { archivePaths } from "@/features/posts/archives";
import { listPublicArchives } from "@/features/posts/data";
import { laterPageParams, parsePageParam } from "@/features/posts/pagination";
import { noIndexMetadata } from "@/features/seo/metadata";
import { AuthorArchive, authorArchiveMetadata } from "../../author-archive";

// Later pages of an author archive; same cache contract as /authors/[slug].
// /authors/[slug]/page/1 redirects to /authors/[slug].
export const revalidate = 300;

export async function generateStaticParams() {
  return (await listPublicArchives()).authors.flatMap(({ slug, postCount }) =>
    laterPageParams(postCount).map(({ page }) => ({ slug, page })),
  );
}

export async function generateMetadata({
  params,
}: PageProps<"/[locale]/authors/[slug]/page/[page]">): Promise<Metadata> {
  const { slug, page: pageParam } = await params;
  const page = parsePageParam(pageParam);
  return page === null || page === 1 ? noIndexMetadata : authorArchiveMetadata(slug, page);
}

export default async function AuthorArchiveLaterPage({
  params,
}: PageProps<"/[locale]/authors/[slug]/page/[page]">) {
  const { slug, page: pageParam } = await params;
  const page = parsePageParam(pageParam);
  if (page === null) notFound();
  if (page === 1) permanentRedirect(archivePaths.author(slug));

  return <AuthorArchive slug={slug} page={page} />;
}
