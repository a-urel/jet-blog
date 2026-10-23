import type { Metadata } from "next";
import { notFound, permanentRedirect } from "next/navigation";

import { archivePaths } from "@/features/posts/archives";
import { ArchiveLayout } from "@/features/posts/components/archive-layout";
import { findAuthorArchive, listPublicArchives } from "@/features/posts/data";
import { buildArchiveMetadata, noIndexMetadata } from "@/features/seo/metadata";
import { getSiteName } from "@/lib/site-url";

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
  const { slug } = await params;
  const lookup = await findAuthorArchive(slug);
  if (lookup.kind !== "archive") return noIndexMetadata;

  const { subject } = lookup;
  return buildArchiveMetadata({
    title: subject.name,
    description: subject.bio ?? `${subject.name} imzalı yazılar.`,
    path: archivePaths.author(subject.slug),
    siteName: getSiteName(),
  });
}

export default async function AuthorArchivePage({ params }: PageProps<"/authors/[slug]">) {
  const { slug } = await params;
  const lookup = await findAuthorArchive(slug);
  if (lookup.kind === "redirect") permanentRedirect(archivePaths.author(lookup.slug));
  if (lookup.kind !== "archive") notFound();

  return (
    <ArchiveLayout
      eyebrow="Yazar"
      title={lookup.subject.name}
      description={lookup.subject.bio}
      posts={lookup.posts}
    />
  );
}
