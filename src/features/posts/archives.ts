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
  // Published posts the archive lists, for prerendering its later pages.
  postCount: number;
};

export type PublicArchives = {
  categories: ArchiveEntry[];
  tags: ArchiveEntry[];
  authors: ArchiveEntry[];
};

type CategoryWithSlug = CategoryNode & { slug: string };

type EntryStats = Omit<ArchiveEntry, "slug">;

function record(map: Map<string, EntryStats>, slug: string, updatedAt: string) {
  const current = map.get(slug);
  map.set(slug, {
    lastModified:
      !current || Date.parse(updatedAt) > Date.parse(current.lastModified)
        ? updatedAt
        : current.lastModified,
    postCount: (current?.postCount ?? 0) + 1,
  });
}

function toEntries(map: Map<string, EntryStats>): ArchiveEntry[] {
  return [...map]
    .map(([slug, stats]) => ({ slug, ...stats }))
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
  const categoryStats = new Map<string, EntryStats>();
  const tagStats = new Map<string, EntryStats>();
  const authorStats = new Map<string, EntryStats>();

  for (const post of posts) {
    for (const categoryId of collectCategoryAncestry(categories, post.category.id)) {
      const slug = categorySlugs.get(categoryId);
      if (slug) record(categoryStats, slug, post.updatedAt);
    }
    for (const tag of post.tags) record(tagStats, tag.slug, post.updatedAt);
    for (const { author } of post.authors) record(authorStats, author.slug, post.updatedAt);
  }

  return {
    categories: toEntries(categoryStats),
    tags: toEntries(tagStats),
    authors: toEntries(authorStats),
  };
}
