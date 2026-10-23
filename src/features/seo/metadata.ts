import type { Metadata } from "next";

import { postPath } from "@/features/posts/archives";
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

export function buildPostMetadata(post: PostSummary, siteName: string): Metadata {
  const path = postPath(post.slug);
  const description = post.excerpt ?? undefined;

  return {
    title: post.title,
    description,
    alternates: { canonical: path },
    openGraph: {
      type: "article",
      url: path,
      siteName,
      locale: "tr_TR",
      title: post.title,
      description,
      publishedTime: post.publishedAt,
      modifiedTime: post.updatedAt,
      authors: post.authors.map(({ author }) => author.name),
      section: post.category.name,
      tags: post.tags.map((tag) => tag.name),
    },
    // No post images exist yet (no cover field), so a text-only card.
    twitter: {
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
