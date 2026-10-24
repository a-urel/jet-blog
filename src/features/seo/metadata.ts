import type { Metadata } from "next";

import { mediaPublicUrl } from "@/features/media/url";
import { postPath } from "@/features/posts/archives";
import { openGraphLocale } from "@/features/posts/language";
import { pagePath } from "@/features/posts/pagination";
import type { PostSummary } from "@/features/posts/types";
import { feedAlternateTypes } from "./feed";

// Pure metadata builders. Paths stay relative; the root layout's metadataBase
// (NEXT_PUBLIC_SITE_URL) turns canonical and Open Graph URLs into absolute
// ones. The canonical post URL never depends on the category or tag path a
// reader arrived from.

// Unknown, unpublished, and empty-archive URLs answer 404 and stay out of
// search indexes.
export const noIndexMetadata: Metadata = {
  robots: { index: false, follow: false },
};

// Canonical URL plus the feed discovery link. Metadata merges segments
// shallowly, so a page that sets alternates replaces the root layout's and
// must repeat the feed link, or the link disappears from that page.
export function canonicalAlternates(path: string): Metadata["alternates"] {
  const types = feedAlternateTypes();
  return { canonical: path, ...(types ? { types } : {}) };
}

// Absolute delivery URL of a post's cover. It lives on the media origin
// (Supabase Storage, D4), not the site origin, so metadataBase does not apply.
export function postCoverImageUrl(post: Pick<PostSummary, "cover">): string | null {
  return post.cover ? mediaPublicUrl(post.cover.mediaId) : null;
}

export function buildPostMetadata(post: PostSummary, siteName: string): Metadata {
  const path = postPath(post.slug);
  const description = post.excerpt ?? undefined;
  const coverUrl = postCoverImageUrl(post);
  const coverAlt = post.cover?.alt || undefined;

  return {
    title: post.title,
    description,
    alternates: canonicalAlternates(path),
    openGraph: {
      type: "article",
      url: path,
      siteName,
      locale: openGraphLocale(post.language),
      title: post.title,
      description,
      publishedTime: post.publishedAt,
      modifiedTime: post.updatedAt,
      authors: post.authors.map(({ author }) => author.name),
      section: post.category.name,
      tags: post.tags.map((tag) => tag.name),
      ...(coverUrl ? { images: [{ url: coverUrl, alt: coverAlt }] } : {}),
    },
    // A cover makes a large image card; without one the card stays text-only.
    twitter: coverUrl
      ? {
          card: "summary_large_image",
          title: post.title,
          description,
          images: [{ url: coverUrl, alt: coverAlt }],
        }
      : {
          card: "summary",
          title: post.title,
          description,
        },
  };
}

// Later pages of a listing carry the page number in their title.
export function pageTitle(title: string, page: number) {
  return page > 1 ? `${title} — Sayfa ${page}` : title;
}

// Each page of a listing is its own canonical URL (page 1 is the listing's
// path, later pages <path>/page/[page]); pointing later pages at page 1 would
// tell search engines to ignore the posts listed only there. No rel=prev/next:
// the Metadata API has no field for it and major search engines ignore it.
export function buildArchiveMetadata(input: {
  title: string;
  description: string;
  path: string;
  siteName: string;
  page?: number;
}): Metadata {
  const page = input.page ?? 1;
  const path = pagePath(input.path, page);
  const title = pageTitle(input.title, page);

  return {
    title,
    description: input.description,
    alternates: canonicalAlternates(path),
    openGraph: {
      type: "website",
      url: path,
      siteName: input.siteName,
      locale: "tr_TR",
      title,
      description: input.description,
    },
    twitter: {
      card: "summary",
      title,
      description: input.description,
    },
  };
}
