import type { Metadata } from "next";
import { notFound, permanentRedirect } from "next/navigation";

import { archivePaths } from "@/features/posts/archives";
import { ArchiveLayout } from "@/features/posts/components/archive-layout";
import { findTagArchive } from "@/features/posts/data";
import { pagePath } from "@/features/posts/pagination";
import { buildArchiveMetadata, noIndexMetadata } from "@/features/seo/metadata";
import { getSiteName } from "@/lib/site-url";

// The tag archive, shared by /tags/[slug] (page 1) and
// /tags/[slug]/page/[page]. Tags without a published post, and pages past the
// end, return 404.

export async function tagArchiveMetadata(slug: string, page: number): Promise<Metadata> {
  const lookup = await findTagArchive(slug, page);
  if (lookup.kind !== "archive") return noIndexMetadata;

  const { subject } = lookup;
  return buildArchiveMetadata({
    title: `${subject.name} etiketi`,
    description: subject.description ?? `${subject.name} etiketiyle işaretlenen yazılar.`,
    path: archivePaths.tag(subject.slug),
    siteName: getSiteName(),
    page,
  });
}

export async function TagArchive({ slug, page }: { slug: string; page: number }) {
  const lookup = await findTagArchive(slug, page);
  if (lookup.kind === "redirect") permanentRedirect(pagePath(archivePaths.tag(lookup.slug), page));
  if (lookup.kind !== "archive") notFound();

  return (
    <ArchiveLayout
      eyebrow="Etiket"
      title={lookup.subject.name}
      description={lookup.subject.description}
      basePath={archivePaths.tag(lookup.subject.slug)}
      posts={lookup.posts}
    />
  );
}
