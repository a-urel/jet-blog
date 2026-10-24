import type { Metadata } from "next";

import { listPublicArchives } from "@/features/posts/data";
import { CategoryArchive, categoryArchiveMetadata } from "./category-archive";

// Same cache contract as /posts/[slug]: ISR with tagged anonymous reads that
// publication Server Actions expire. Unknown categories and categories whose
// subtree has no published post return 404.
export const revalidate = 300;

export async function generateStaticParams() {
  return (await listPublicArchives()).categories.map(({ slug }) => ({ slug }));
}

export async function generateMetadata({
  params,
}: PageProps<"/[locale]/categories/[slug]">): Promise<Metadata> {
  return categoryArchiveMetadata((await params).slug, 1);
}

export default async function CategoryArchivePage({
  params,
}: PageProps<"/[locale]/categories/[slug]">) {
  return <CategoryArchive slug={(await params).slug} page={1} />;
}
