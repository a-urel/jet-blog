import { isPostLanguage } from "./language";
import type { Author, Category, Post, PostCoverImage, PostSummary, Tag } from "./types";

// Pure mapping from PostgREST rows to the public read model. Kept free of
// server-only imports so unit tests can exercise it directly.

type RelatedRecord<T> = T | T[] | null | undefined;

export type RawPublicPost = {
  id: string;
  slug: string;
  title: string;
  excerpt: string | null;
  language: string;
  cover_media_id?: string | null;
  cover_alt?: string | null;
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
    author: RelatedRecord<{ id: string; name: string; slug: string; avatar_id?: string | null }>;
  }>;
  post_tags: RelatedRecord<{
    tag: RelatedRecord<{ id: string; name: string; slug: string }>;
  }>;
};

// Public reads come from the published snapshot (published_posts and its
// credits and tags), never from the working copy in posts. The aliases keep
// the row shape of the working-copy tables (id, post_authors, post_tags).
export const publishedPostsTable = "published_posts";

// Columns the public listing needs. The post page adds the body.
export const publicPostSummaryColumns =
  "id:post_id, slug, title, excerpt, language, cover_media_id, cover_alt, published_at, updated_at, category:categories(id, name, slug, parent_id), post_authors:published_post_authors(sort_order, author:authors(id, name, slug, avatar_id)), post_tags:published_post_tags(tag:tags(id, name, slug))";

export const publicPostColumns = `${publicPostSummaryColumns}, body, content_version`;

function firstRelated<T>(value: RelatedRecord<T>): T | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function validUuid(value: string | null | undefined): string | null {
  return typeof value === "string" && uuidPattern.test(value) ? value : null;
}

// The database requires alt text on a published cover; an empty string is the
// controlled fallback for a row that somehow lacks it.
function mapCover(row: RawPublicPost): PostCoverImage | null {
  const mediaId = row.cover_media_id;
  if (typeof mediaId !== "string" || !uuidPattern.test(mediaId)) return null;

  return { mediaId, alt: row.cover_alt ?? "" };
}

function manyRelated<T>(value: RelatedRecord<T>): T[] {
  if (Array.isArray(value)) return value;
  return value ? [value] : [];
}

// Returns null for a row that cannot be shown publicly: a published post
// always has a publication time, a category, and a canonical language tag, so
// anything else is a partial or inconsistent read and stays hidden.
export function mapPublicPostSummary(row: RawPublicPost): PostSummary | null {
  const category = firstRelated(row.category);
  if (!row.published_at || !category || !isPostLanguage(row.language)) return null;

  const authors = manyRelated(row.post_authors)
    .flatMap((credit) => {
      const author = firstRelated(credit.author);
      return author
        ? [
            {
              author: {
                id: author.id,
                name: author.name,
                slug: author.slug,
                avatarId: validUuid(author.avatar_id),
              } satisfies Author,
              sortOrder: credit.sort_order,
            },
          ]
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
    language: row.language,
    cover: mapCover(row),
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

// "Güncellendi" is shown only after a republish. Publishing itself sets
// updated_at and published_at to the same transaction time; saving the
// working copy changes neither.
export function wasUpdatedAfterPublication(
  post: Pick<PostSummary, "publishedAt" | "updatedAt">,
): boolean {
  const published = Date.parse(post.publishedAt);
  const updated = Date.parse(post.updatedAt);

  return Number.isFinite(published) && Number.isFinite(updated) && updated > published;
}
