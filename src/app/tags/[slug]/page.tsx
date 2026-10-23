import type { Metadata } from "next";
import { notFound, permanentRedirect } from "next/navigation";

import { archivePaths } from "@/features/posts/archives";
import { ArchiveLayout } from "@/features/posts/components/archive-layout";
import { findTagArchive, listPublicArchives } from "@/features/posts/data";
import { buildArchiveMetadata, noIndexMetadata } from "@/features/seo/metadata";
import { getSiteName } from "@/lib/site-url";

// Same cache contract as /posts/[slug]. Tags without a published post 404.
export const revalidate = 300;

export async function generateStaticParams() {
  return (await listPublicArchives()).tags.map(({ slug }) => ({ slug }));
}

export async function generateMetadata({
  params,
}: PageProps<"/tags/[slug]">): Promise<Metadata> {
  const { slug } = await params;
  const lookup = await findTagArchive(slug);
  if (lookup.kind !== "archive") return noIndexMetadata;

  const { subject } = lookup;
  return buildArchiveMetadata({
    title: `${subject.name} etiketi`,
    description: subject.description ?? `${subject.name} etiketiyle işaretlenen yazılar.`,
    path: archivePaths.tag(subject.slug),
    siteName: getSiteName(),
  });
}

export default async function TagArchivePage({ params }: PageProps<"/tags/[slug]">) {
  const { slug } = await params;
  const lookup = await findTagArchive(slug);
  if (lookup.kind === "redirect") permanentRedirect(archivePaths.tag(lookup.slug));
  if (lookup.kind !== "archive") notFound();

  return (
    <ArchiveLayout
      eyebrow="Etiket"
      title={lookup.subject.name}
      description={lookup.subject.description}
      posts={lookup.posts}
    />
  );
}
