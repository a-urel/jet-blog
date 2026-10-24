import type { Metadata } from "next";
import { notFound, permanentRedirect } from "next/navigation";

import { IdentityAvatar } from "@/features/avatars/components/identity-avatar";
import { archivePaths } from "@/features/posts/archives";
import { ArchiveLayout } from "@/features/posts/components/archive-layout";
import { findAuthorArchive } from "@/features/posts/data";
import { pagePath } from "@/features/posts/pagination";
import { buildArchiveMetadata, noIndexMetadata } from "@/features/seo/metadata";
import { getSiteName } from "@/lib/site-url";

// The author archive, shared by /authors/[slug] (page 1) and
// /authors/[slug]/page/[page]. RLS exposes an author only while they are
// credited on a published post, so uncredited and draft-only authors 404, as
// do pages past the end. An old slug redirects to the same page of the current
// one (author administration).

export async function authorArchiveMetadata(slug: string, page: number): Promise<Metadata> {
  const lookup = await findAuthorArchive(slug, page);
  if (lookup.kind !== "archive") return noIndexMetadata;

  const { subject } = lookup;
  return buildArchiveMetadata({
    title: subject.name,
    description: subject.bio ?? `${subject.name} imzalı yazılar.`,
    path: archivePaths.author(subject.slug),
    siteName: getSiteName(),
    page,
  });
}

export async function AuthorArchive({ slug, page }: { slug: string; page: number }) {
  const lookup = await findAuthorArchive(slug, page);
  if (lookup.kind === "redirect") {
    permanentRedirect(pagePath(archivePaths.author(lookup.slug), page));
  }
  if (lookup.kind !== "archive") notFound();

  return (
    <ArchiveLayout
      eyebrow="Yazar"
      title={lookup.subject.name}
      avatar={
        <IdentityAvatar
          kind="authors"
          avatarId={lookup.subject.avatar_id}
          name={lookup.subject.name}
          size="xl"
        />
      }
      description={lookup.subject.bio}
      basePath={archivePaths.author(lookup.subject.slug)}
      posts={lookup.posts}
    />
  );
}
