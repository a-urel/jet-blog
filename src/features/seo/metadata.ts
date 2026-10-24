import type { Metadata } from "next";

import { postPath } from "@/features/posts/archives";
import { openGraphLocale } from "@/features/posts/language";
import { pagePath } from "@/features/posts/pagination";
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
      locale: openGraphLocale(post.language),
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
    alternates: { canonical: path },
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
