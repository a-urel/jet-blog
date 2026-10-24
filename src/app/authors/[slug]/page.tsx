import type { Metadata } from "next";

import { listPublicArchives } from "@/features/posts/data";
import { AuthorArchive, authorArchiveMetadata } from "./author-archive";

// Same cache contract as /posts/[slug]. RLS exposes an author only while they
// are credited on a published post, so uncredited and draft-only authors 404.
// An old slug redirects to the current one (author administration).
export const revalidate = 300;

export async function generateStaticParams() {
  return (await listPublicArchives()).authors.map(({ slug }) => ({ slug }));
}

export async function generateMetadata({
  params,
}: PageProps<"/authors/[slug]">): Promise<Metadata> {
  return authorArchiveMetadata((await params).slug, 1);
}

export default async function AuthorArchivePage({ params }: PageProps<"/authors/[slug]">) {
  return <AuthorArchive slug={(await params).slug} page={1} />;
}
