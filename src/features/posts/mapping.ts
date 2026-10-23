import type { Author, Category, Post, PostSummary, Tag } from "./types";

// Pure mapping from PostgREST rows to the public read model. Kept free of
// server-only imports so unit tests can exercise it directly.

type RelatedRecord<T> = T | T[] | null | undefined;

export type RawPublicPost = {
  id: string;
  slug: string;
  title: string;
  excerpt: string | null;
  published_at: string | null;
  updated_at: string;
  body?: unknown;
  content_version?: number;
  category: RelatedRecord<{
    id: string;
    name: string;
    slug: string;
    parent_id: string | null;
  }>;
  post_authors: RelatedRecord<{
    sort_order: number;
    author: RelatedRecord<{ id: string; name: string; slug: string }>;
  }>;
  post_tags: RelatedRecord<{
    tag: RelatedRecord<{ id: string; name: string; slug: string }>;
  }>;
};

// Columns the public listing needs. The post page adds the body.
export const publicPostSummaryColumns =
  "id, slug, title, excerpt, published_at, updated_at, category:categories(id, name, slug, parent_id), post_authors(sort_order, author:authors(id, name, slug)), post_tags(tag:tags(id, name, slug))";

export const publicPostColumns = `${publicPostSummaryColumns}, body, content_version`;

function firstRelated<T>(value: RelatedRecord<T>): T | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

function manyRelated<T>(value: RelatedRecord<T>): T[] {
  if (Array.isArray(value)) return value;
  return value ? [value] : [];
}

// Returns null for a row that cannot be shown publicly: a published post
// always has a publication time and a category, so anything else is a
// partial or inconsistent read and stays hidden.
export function mapPublicPostSummary(row: RawPublicPost): PostSummary | null {
  const category = firstRelated(row.category);
  if (!row.published_at || !category) return null;

  const authors = manyRelated(row.post_authors)
    .flatMap((credit) => {
      const author = firstRelated(credit.author);
      return author
        ? [{ author: { id: author.id, name: author.name, slug: author.slug } satisfies Author, sortOrder: credit.sort_order }]
        : [];
    })
    .sort((left, right) => left.sortOrder - right.sortOrder);

  const tags = manyRelated(row.post_tags)
    .flatMap((relation) => {
      const tag = firstRelated(relation.tag);
      return tag ? [{ id: tag.id, name: tag.name, slug: tag.slug } satisfies Tag] : [];
    })
    .sort((left, right) => left.name.localeCompare(right.name, "tr"));

  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    excerpt: row.excerpt,
    publishedAt: row.published_at,
    updatedAt: row.updated_at,
    authors,
    category: {
      id: category.id,
      name: category.name,
      slug: category.slug,
      parentId: category.parent_id,
    } satisfies Category,
    tags,
  };
}

export function mapPublicPost(row: RawPublicPost): Post | null {
  const summary = mapPublicPostSummary(row);
  if (!summary || typeof row.content_version !== "number") return null;

  return { ...summary, body: row.body, contentVersion: row.content_version };
}

// "Güncellendi" is shown only for edits after publication. Publishing itself
// sets updated_at and published_at to the same transaction time.
export function wasUpdatedAfterPublication(
  post: Pick<PostSummary, "publishedAt" | "updatedAt">,
): boolean {
  const published = Date.parse(post.publishedAt);
  const updated = Date.parse(post.updatedAt);

  return Number.isFinite(published) && Number.isFinite(updated) && updated > published;
}
