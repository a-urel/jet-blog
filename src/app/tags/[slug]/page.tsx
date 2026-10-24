import type { Metadata } from "next";

import { listPublicArchives } from "@/features/posts/data";
import { TagArchive, tagArchiveMetadata } from "./tag-archive";

// Same cache contract as /posts/[slug]. Tags without a published post 404.
export const revalidate = 300;

export async function generateStaticParams() {
  return (await listPublicArchives()).tags.map(({ slug }) => ({ slug }));
}

export async function generateMetadata({
  params,
}: PageProps<"/tags/[slug]">): Promise<Metadata> {
  return tagArchiveMetadata((await params).slug, 1);
}

export default async function TagArchivePage({ params }: PageProps<"/tags/[slug]">) {
  return <TagArchive slug={(await params).slug} page={1} />;
}
