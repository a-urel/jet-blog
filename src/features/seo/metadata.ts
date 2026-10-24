import type { Metadata } from "next";

import { mediaPublicUrl } from "@/features/media/url";
import { postPath } from "@/features/posts/archives";
import { openGraphLocale } from "@/features/posts/language";
import type { PostSummary } from "@/features/posts/types";

// Pure metadata builders. Paths stay relative; the root layout's metadataBase
// (NEXT_PUBLIC_SITE_URL) turns canonical and Open Graph URLs into absolute
// ones. The canonical post URL never depends on the category or tag path a
// reader arrived from.

// Unknown, unpublished, and empty-archive URLs answer 404 and stay out of
// search indexes.
export const noIndexMetadata: Metadata = {
  robots: { index: false, follow: false },
};

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
    alternates: { canonical: path },
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

export function buildArchiveMetadata(input: {
  title: string;
  description: string;
  path: string;
  siteName: string;
}): Metadata {
  return {
    title: input.title,
    description: input.description,
    alternates: { canonical: input.path },
    openGraph: {
      type: "website",
      url: input.path,
      siteName: input.siteName,
      locale: "tr_TR",
      title: input.title,
      description: input.description,
    },
    twitter: {
      card: "summary",
      title: input.title,
      description: input.description,
    },
  };
}
