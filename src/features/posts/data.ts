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
import {
  mapPublicPost,
  mapPublicPostSummary,
  publicPostColumns,
  type RawPublicPost,
} from "./mapping";
import {
  selectAuthorBySlug,
  selectCategories,
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

export const listPublishedPosts = cache(async (): Promise<PostSummary[]> => {
  // A checkout without Supabase credentials still builds and renders.
  if (!isSupabaseConfigured()) return [];

  const { data, error } = await selectPublishedPostSummaries(publicClient());

  if (error) throw new Error(`Published posts could not be loaded: ${error.message}`);

  return mapSummaries(data);
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

export type ArchiveLookup<T> =
  | { kind: "archive"; subject: T; posts: PostSummary[] }
  | { kind: "missing" };

export type CategoryArchive = PublicCategory & {
  // Root first, ending with the category itself.
  trail: Pick<PublicCategory, "name" | "slug">[];
  // Direct children that list at least one post in this archive.
  children: Pick<PublicCategory, "name" | "slug">[];
};

// The archive lists posts of the category and all of its descendants.
export const findCategoryArchive = cache(
  async (slug: string): Promise<ArchiveLookup<CategoryArchive>> => {
    if (!isSupabaseConfigured()) return { kind: "missing" };

    const categories = await listCategories();
    const category = categories.find((candidate) => candidate.slug === slug);
    if (!category) return { kind: "missing" };

    const subtree = collectCategorySubtree(categories, category.id);
    const { data, error } = await selectPublishedPostsInCategories(publicClient(), subtree);

    if (error) throw new Error(`Category archive could not be loaded: ${error.message}`);

    const posts = mapSummaries(data);
    if (posts.length === 0) return { kind: "missing" };

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
        const childSubtree = new Set(collectCategorySubtree(categories, child.id));
        return posts.some((post) => childSubtree.has(post.category.id));
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
  async (slug: string): Promise<ArchiveLookup<TagArchive>> => {
    if (!isSupabaseConfigured()) return { kind: "missing" };

    const supabase = publicClient();
    const tag = await selectTagBySlug(supabase, slug);
    if (tag.error) throw new Error(`Tag could not be loaded: ${tag.error.message}`);
    if (!tag.data) return { kind: "missing" };

    const { data, error } = await selectPublishedPostsWithTag(supabase, tag.data.id);
    if (error) throw new Error(`Tag archive could not be loaded: ${error.message}`);

    const posts = mapSummaries(data);
    return posts.length > 0
      ? { kind: "archive", subject: tag.data as TagArchive, posts }
      : { kind: "missing" };
  },
);

export type AuthorArchive = {
  id: string;
  name: string;
  slug: string;
  bio: string | null;
};

export const findAuthorArchive = cache(
  async (slug: string): Promise<ArchiveLookup<AuthorArchive>> => {
    if (!isSupabaseConfigured()) return { kind: "missing" };

    const supabase = publicClient();
    const author = await selectAuthorBySlug(supabase, slug);
    if (author.error) throw new Error(`Author could not be loaded: ${author.error.message}`);
    if (!author.data) return { kind: "missing" };

    const { data, error } = await selectPublishedPostsByAuthor(supabase, author.data.id);
    if (error) throw new Error(`Author archive could not be loaded: ${error.message}`);

    const posts = mapSummaries(data);
    return posts.length > 0
      ? { kind: "archive", subject: author.data as AuthorArchive, posts }
      : { kind: "missing" };
  },
);
