import "server-only";

import { cache } from "react";

import { isSupabaseConfigured } from "@/lib/supabase/env";
import { createPublicServerSupabaseClient } from "@/lib/supabase/server";
import { publicPostsCacheTag } from "./cache";
import {
  mapPublicPost,
  mapPublicPostSummary,
  publicPostColumns,
  publicPostSummaryColumns,
  type RawPublicPost,
} from "./mapping";
import type { Post, PostSummary } from "./types";

// Public reads use the anonymous client only: RLS limits every row (posts,
// credits, tags, redirects) to published content, and no session cookie is
// read, so the calling pages stay prerenderable. The explicit status filter is
// defense in depth, not the authorization rule.
//
// Errors throw instead of returning empty results so a transient failure does
// not get cached as an empty listing or a 404.

function publicClient() {
  return createPublicServerSupabaseClient({ cacheTags: [publicPostsCacheTag] });
}

export type PostLookup =
  | { kind: "post"; post: Post }
  | { kind: "redirect"; slug: string }
  | { kind: "missing" };

export async function listPublishedPosts(): Promise<PostSummary[]> {
  // A checkout without Supabase credentials still builds and renders.
  if (!isSupabaseConfigured()) return [];

  const { data, error } = await publicClient()
    .from("posts")
    .select(publicPostSummaryColumns)
    .eq("status", "published")
    .order("published_at", { ascending: false });

  if (error) throw new Error(`Published posts could not be loaded: ${error.message}`);

  return ((data ?? []) as unknown as RawPublicPost[]).flatMap((row) => {
    const post = mapPublicPostSummary(row);
    return post ? [post] : [];
  });
}

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
