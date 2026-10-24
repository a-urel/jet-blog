import "server-only";

import { cache } from "react";

import { isSupabaseConfigured } from "@/lib/supabase/env";
import { createPublicServerSupabaseClient } from "@/lib/supabase/server";
import {
  collectCategoryAncestry,
  collectCategorySubtree,
} from "@/features/taxonomy/hierarchy";
import { derivePublicArchives, type PublicArchives } from "./archives";
import { publicPostsCacheTag } from "./cache";
import { pageBounds, pageCount, type PostPage } from "./pagination";
import {
  mapPublicPost,
  mapPublicPostSummary,
  publicPostColumns,
  type RawPublicPost,
} from "./mapping";
import {
  selectAuthorBySlug,
  selectCategories,
  selectLatestPublishedPosts,
  selectPublishedPostCategoryIds,
  selectPublishedPostsByAuthor,
  selectPublishedPostsInCategories,
  selectPublishedPostsWithTag,
  selectPublishedPostSummaries,
  selectTagBySlug,
} from "./queries";
import type { Post, PostSummary } from "./types";

// Public reads use the anonymous client only: RLS limits every row (posts,
// credits, tags, redirects) to published content, and no session cookie is
// read, so the calling pages stay prerenderable. The explicit status filter is
// defense in depth, not the authorization rule.
//
// Errors throw instead of returning empty results so a transient failure does
// not get cached as an empty listing or a 404.
//
// Taxonomy and author reads share publicPostsCacheTag: they are part of the
// same public output (archives, sitemap) and expire together.

function publicClient() {
  return createPublicServerSupabaseClient({ cacheTags: [publicPostsCacheTag] });
}

export type PostLookup =
  | { kind: "post"; post: Post }
  | { kind: "redirect"; slug: string }
  | { kind: "missing" };

function mapSummaries(rows: unknown[] | null): PostSummary[] {
  return ((rows ?? []) as RawPublicPost[]).flatMap((row) => {
    const post = mapPublicPostSummary(row);
    return post ? [post] : [];
  });
}

// PostgREST answers 416 with this code when a range starts past the last row.
const rangeNotSatisfiable = "PGRST103";

type CountedResult = {
  data: unknown;
  error: { code?: string; message: string } | null;
  count: number | null;
};

// Reads one page of a counted, ordered listing query (queries.ts). Returns
// null for a page past the end; page 1 of an empty listing is an empty page.
async function readPage(
  query: { range(from: number, to: number): PromiseLike<CountedResult> },
  page: number,
  label: string,
): Promise<PostPage | null> {
  const { from, to } = pageBounds(page);
  const { data, error, count } = await query.range(from, to);

  if (error?.code === rangeNotSatisfiable) return null;
  if (error) throw new Error(`${label} could not be loaded: ${error.message}`);

  const total = count ?? 0;
  if (page > pageCount(total)) return null;

  return { posts: mapSummaries(data as unknown[] | null), page, pageCount: pageCount(total), total };
}

// Every published post, for the sitemap and archive discovery. Listings read
// one page at a time (listPublishedPostPage, the archive lookups).
export const listPublishedPosts = cache(async (): Promise<PostSummary[]> => {
  // A checkout without Supabase credentials still builds and renders.
  if (!isSupabaseConfigured()) return [];

  const { data, error } = await selectPublishedPostSummaries(publicClient());

  if (error) throw new Error(`Published posts could not be loaded: ${error.message}`);

  return mapSummaries(data);
});

// The newest published posts for the syndication feed (src/app/feed.xml).
export async function listLatestPublishedPosts(limit: number): Promise<PostSummary[]> {
  if (!isSupabaseConfigured()) return [];

  const { data, error } = await selectLatestPublishedPosts(publicClient(), limit);

  if (error) throw new Error(`Latest published posts could not be loaded: ${error.message}`);

  return mapSummaries(data);
}

// One page of the home listing. null means the page is past the end.
export const listPublishedPostPage = cache(async (page: number): Promise<PostPage | null> => {
  if (!isSupabaseConfigured()) {
    return page === 1 ? { posts: [], page, pageCount: 1, total: 0 } : null;
  }

  return readPage(selectPublishedPostSummaries(publicClient()), page, "Published posts");
});

export async function listPublishedSlugs(): Promise<string[]> {
  if (!isSupabaseConfigured()) return [];

  const { data, error } = await publicClient()
    .from("posts")
    .select("slug")
    .eq("status", "published");

  if (error) throw new Error(`Published slugs could not be loaded: ${error.message}`);

  return ((data ?? []) as { slug: string }[]).map((row) => row.slug);
}

// Deduplicated per render so generateMetadata and the page share one query.
export const findPublishedPost = cache(
  async (slug: string): Promise<PostLookup> => {
    if (!isSupabaseConfigured()) return { kind: "missing" };

    const supabase = publicClient();
    const { data, error } = await supabase
      .from("posts")
      .select(publicPostColumns)
      .eq("status", "published")
      .eq("slug", slug)
      .maybeSingle();

    if (error) throw new Error(`Post could not be loaded: ${error.message}`);

    if (data) {
      const post = mapPublicPost(data as unknown as RawPublicPost);
      return post ? { kind: "post", post } : { kind: "missing" };
    }

    // An old slug resolves to the post's current slug in one hop. RLS hides
    // redirects of unpublished posts, so those URLs return 404.
    const redirect = await supabase
      .from("post_slug_redirects")
      .select("post:posts!inner(slug, status)")
      .eq("old_slug", slug)
      .eq("post.status", "published")
      .maybeSingle();

    if (redirect.error) {
      throw new Error(`Post redirect could not be loaded: ${redirect.error.message}`);
    }

    const target = redirect.data?.post as
      | { slug: string }
      | { slug: string }[]
      | null
      | undefined;
    const targetSlug = Array.isArray(target) ? target[0]?.slug : target?.slug;

    return targetSlug && targetSlug !== slug
      ? { kind: "redirect", slug: targetSlug }
      : { kind: "missing" };
  },
);

export type PublicCategory = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  parentId: string | null;
};

type RawCategory = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  parent_id: string | null;
};

// Categories are public metadata (RLS: readable by everyone); the archive
// still returns 404 unless the category subtree has a published post.
const listCategories = cache(async (): Promise<PublicCategory[]> => {
  if (!isSupabaseConfigured()) return [];

  const { data, error } = await selectCategories(publicClient());

  if (error) throw new Error(`Categories could not be loaded: ${error.message}`);

  return ((data ?? []) as RawCategory[]).map((row) => ({
    id: row.id,
    name: row.name,
    slug: row.slug,
    description: row.description,
    parentId: row.parent_id,
  }));
});

// Archives with at least one published post, for the sitemap and
// generateStaticParams.
export async function listPublicArchives(): Promise<PublicArchives> {
  const [posts, categories] = await Promise.all([listPublishedPosts(), listCategories()]);
  return derivePublicArchives(posts, categories);
}

// "missing" also covers a page past the end of an existing archive.
export type ArchiveLookup<T> =
  | { kind: "archive"; subject: T; posts: PostPage }
  | { kind: "redirect"; slug: string }
  | { kind: "missing" };

const redirectTargets = {
  category_slug_redirects: "categories",
  tag_slug_redirects: "tags",
  author_slug_redirects: "authors",
} as const;

// Old category, tag, and author slugs (renames, and deleted categories whose
// posts moved) resolve to the current slug in one hop. The target page still
// returns 404 when it has no published post. Author redirects are visible only
// while the author is credited on a published post.
async function findArchiveRedirect(
  table: keyof typeof redirectTargets,
  slug: string,
): Promise<ArchiveLookup<never>> {
  const target = redirectTargets[table];
  const { data, error } = await publicClient()
    .from(table)
    .select(`target:${target}!inner(slug)`)
    .eq("old_slug", slug)
    .maybeSingle();

  if (error) throw new Error(`Archive redirect could not be loaded: ${error.message}`);

  const row = data?.target as { slug: string } | { slug: string }[] | null | undefined;
  const targetSlug = Array.isArray(row) ? row[0]?.slug : row?.slug;

  return targetSlug && targetSlug !== slug
    ? { kind: "redirect", slug: targetSlug }
    : { kind: "missing" };
}

export type CategoryArchive = PublicCategory & {
  // Root first, ending with the category itself.
  trail: Pick<PublicCategory, "name" | "slug">[];
  // Direct children that list at least one post in this archive.
  children: Pick<PublicCategory, "name" | "slug">[];
};

// The archive lists posts of the category and all of its descendants.
export const findCategoryArchive = cache(
  async (slug: string, page: number): Promise<ArchiveLookup<CategoryArchive>> => {
    if (!isSupabaseConfigured()) return { kind: "missing" };

    const categories = await listCategories();
    const category = categories.find((candidate) => candidate.slug === slug);
    if (!category) return findArchiveRedirect("category_slug_redirects", slug);

    const supabase = publicClient();
    const subtree = collectCategorySubtree(categories, category.id);
    const [posts, postCategories] = await Promise.all([
      readPage(selectPublishedPostsInCategories(supabase, subtree), page, "Category archive"),
      selectPublishedPostCategoryIds(supabase, subtree),
    ]);

    if (postCategories.error) {
      throw new Error(`Category archive could not be loaded: ${postCategories.error.message}`);
    }
    if (!posts || posts.total === 0) return { kind: "missing" };

    const listedCategoryIds = new Set(
      ((postCategories.data ?? []) as { category_id: string }[]).map((row) => row.category_id),
    );

    const byId = new Map(categories.map((candidate) => [candidate.id, candidate]));
    const trail = collectCategoryAncestry(categories, category.id)
      .reverse()
      .flatMap((id) => {
        const node = byId.get(id);
        return node ? [{ name: node.name, slug: node.slug }] : [];
      });

    const children = categories
      .filter((candidate) => candidate.parentId === category.id)
      .filter((child) => {
        return collectCategorySubtree(categories, child.id).some((id) => listedCategoryIds.has(id));
      })
      .map(({ name, slug: childSlug }) => ({ name, slug: childSlug }));

    return { kind: "archive", subject: { ...category, trail, children }, posts };
  },
);

export type TagArchive = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
};

export const findTagArchive = cache(
  async (slug: string, page: number): Promise<ArchiveLookup<TagArchive>> => {
    if (!isSupabaseConfigured()) return { kind: "missing" };

    const supabase = publicClient();
    const tag = await selectTagBySlug(supabase, slug);
    if (tag.error) throw new Error(`Tag could not be loaded: ${tag.error.message}`);
    if (!tag.data) return findArchiveRedirect("tag_slug_redirects", slug);

    const posts = await readPage(
      selectPublishedPostsWithTag(supabase, tag.data.id),
      page,
      "Tag archive",
    );
    return posts && posts.total > 0
      ? { kind: "archive", subject: tag.data as TagArchive, posts }
      : { kind: "missing" };
  },
);

export type AuthorArchive = {
  id: string;
  name: string;
  slug: string;
  bio: string | null;
  avatar_id: string | null;
};

export const findAuthorArchive = cache(
  async (slug: string, page: number): Promise<ArchiveLookup<AuthorArchive>> => {
    if (!isSupabaseConfigured()) return { kind: "missing" };

    const supabase = publicClient();
    const author = await selectAuthorBySlug(supabase, slug);
    if (author.error) throw new Error(`Author could not be loaded: ${author.error.message}`);
    if (!author.data) return findArchiveRedirect("author_slug_redirects", slug);

    const posts = await readPage(
      selectPublishedPostsByAuthor(supabase, author.data.id),
      page,
      "Author archive",
    );
    return posts && posts.total > 0
      ? { kind: "archive", subject: author.data as AuthorArchive, posts }
      : { kind: "missing" };
  },
);

export type ArchiveKind = "category" | "tag" | "author";

export type ArchiveFeedLookup =
  | { kind: "feed"; subject: { name: string; slug: string }; posts: PostSummary[] }
  | { kind: "redirect"; slug: string }
  | { kind: "missing" };

// The newest published posts of an archive, for its feed
// (src/app/<archive>/[slug]/feed.xml). The subject, old-slug redirect, and 404
// rules are the archive's first page; the posts are the same filtered,
// ordered query with the feed's limit instead of a page range.
export async function findArchiveFeed(
  archive: ArchiveKind,
  slug: string,
  limit: number,
): Promise<ArchiveFeedLookup> {
  const find =
    archive === "category"
      ? findCategoryArchive
      : archive === "tag"
        ? findTagArchive
        : findAuthorArchive;
  const lookup = await find(slug, 1);
  if (lookup.kind !== "archive") return lookup;

  const supabase = publicClient();
  const { id, name, slug: currentSlug } = lookup.subject;
  const { data, error } = await (archive === "category"
    ? selectPublishedPostsInCategories(
        supabase,
        collectCategorySubtree(await listCategories(), id),
      ).limit(limit)
    : archive === "tag"
      ? selectPublishedPostsWithTag(supabase, id).limit(limit)
      : selectPublishedPostsByAuthor(supabase, id).limit(limit));

  if (error) throw new Error(`Archive feed could not be loaded: ${error.message}`);

  return { kind: "feed", subject: { name, slug: currentSlug }, posts: mapSummaries(data) };
}
