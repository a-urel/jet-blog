import { collectCategoryAncestry, type CategoryNode } from "@/features/taxonomy/hierarchy";
import type { PostSummary } from "./types";

// Archive paths are category-, tag-, and author-scoped listings. A post keeps
// one canonical URL (/posts/[slug]) however many archives list it.
export const archivePaths = {
  category: (slug: string) => `/categories/${slug}`,
  tag: (slug: string) => `/tags/${slug}`,
  author: (slug: string) => `/authors/${slug}`,
};

export function postPath(slug: string) {
  return `/posts/${slug}`;
}

export type ArchiveEntry = {
  slug: string;
  // Latest updatedAt of the posts the archive lists.
  lastModified: string;
};

export type PublicArchives = {
  categories: ArchiveEntry[];
  tags: ArchiveEntry[];
  authors: ArchiveEntry[];
};

type CategoryWithSlug = CategoryNode & { slug: string };

function latest(current: string | undefined, candidate: string) {
  return !current || Date.parse(candidate) > Date.parse(current) ? candidate : current;
}

function toEntries(map: Map<string, string>): ArchiveEntry[] {
  return [...map]
    .map(([slug, lastModified]) => ({ slug, lastModified }))
    .sort((left, right) => left.slug.localeCompare(right.slug));
}

// Derives the archives that list at least one published post. A category
// archive includes its descendants, so every ancestor of a post's category
// gets an entry too. Empty archives return 404 and are left out here.
export function derivePublicArchives(
  posts: readonly PostSummary[],
  categories: readonly CategoryWithSlug[],
): PublicArchives {
  const categorySlugs = new Map(categories.map((category) => [category.id, category.slug]));
  const categoryDates = new Map<string, string>();
  const tagDates = new Map<string, string>();
  const authorDates = new Map<string, string>();

  for (const post of posts) {
    for (const categoryId of collectCategoryAncestry(categories, post.category.id)) {
      const slug = categorySlugs.get(categoryId);
      if (slug) categoryDates.set(slug, latest(categoryDates.get(slug), post.updatedAt));
    }
    for (const tag of post.tags) {
      tagDates.set(tag.slug, latest(tagDates.get(tag.slug), post.updatedAt));
    }
    for (const { author } of post.authors) {
      authorDates.set(author.slug, latest(authorDates.get(author.slug), post.updatedAt));
    }
  }

  return {
    categories: toEntries(categoryDates),
    tags: toEntries(tagDates),
    authors: toEntries(authorDates),
  };
}
