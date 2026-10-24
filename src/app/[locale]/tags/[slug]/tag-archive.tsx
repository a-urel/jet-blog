import type { Metadata } from "next";
import { notFound, permanentRedirect } from "next/navigation";
import { getTranslations } from "next-intl/server";

import { archivePaths } from "@/features/posts/archives";
import { ArchiveLayout } from "@/features/posts/components/archive-layout";
import { findTagArchive } from "@/features/posts/data";
import { pagePath } from "@/features/posts/pagination";
import { archiveFeedChannel } from "@/features/seo/archive-feed";
import { listingMetadataContext } from "@/features/seo/listing-metadata";
import { buildArchiveMetadata, noIndexMetadata } from "@/features/seo/metadata";
import { getSiteName } from "@/lib/site-url";

// The tag archive, shared by /tags/[slug] (page 1) and
// /tags/[slug]/page/[page]. Tags without a published post, and pages past the
// end, return 404.

export async function tagArchiveMetadata(slug: string, page: number): Promise<Metadata> {
  const lookup = await findTagArchive(slug, page);
  if (lookup.kind !== "archive") return noIndexMetadata;

  const { subject } = lookup;
  const t = await getTranslations("archives.tag");
  return buildArchiveMetadata({
    title: t("title", { name: subject.name }),
    description: subject.description ?? t("description", { name: subject.name }),
    path: archivePaths.tag(subject.slug),
    siteName: getSiteName(),
    page,
    feed: await archiveFeedChannel("tag", subject),
    ...(await listingMetadataContext()),
  });
}

export async function TagArchive({ slug, page }: { slug: string; page: number }) {
  const lookup = await findTagArchive(slug, page);
  if (lookup.kind === "redirect") permanentRedirect(pagePath(archivePaths.tag(lookup.slug), page));
  if (lookup.kind !== "archive") notFound();

  const t = await getTranslations("archives.tag");
  return (
    <ArchiveLayout
      eyebrow={t("eyebrow")}
      title={lookup.subject.name}
      description={lookup.subject.description}
      basePath={archivePaths.tag(lookup.subject.slug)}
      posts={lookup.posts}
    />
  );
}
