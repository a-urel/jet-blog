import type { SupabaseClient } from "@supabase/supabase-js";

import { publicPostSummaryColumns } from "./mapping";

// Public read queries shared by the server data boundary (data.ts) and the
// RLS tests, which run them with a real anonymous client. They take the client
// as an argument and stay free of server-only imports. RLS is the
// authorization rule; the status filter is defense in depth.

export function selectPublishedPostSummaries(client: SupabaseClient) {
  return client
    .from("posts")
    .select(publicPostSummaryColumns)
    .eq("status", "published")
    .order("published_at", { ascending: false });
}

export function selectPublishedPostsInCategories(
  client: SupabaseClient,
  categoryIds: string[],
) {
  return selectPublishedPostSummaries(client).in("category_id", categoryIds);
}

// The filter relation is a second, aliased embed so the post still carries
// all of its tags (or credits) for display.
export function selectPublishedPostsWithTag(client: SupabaseClient, tagId: string) {
  return client
    .from("posts")
    .select(`${publicPostSummaryColumns}, tag_filter:post_tags!inner(tag_id)`)
    .eq("status", "published")
    .eq("tag_filter.tag_id", tagId)
    .order("published_at", { ascending: false });
}

export function selectPublishedPostsByAuthor(
  client: SupabaseClient,
  authorId: string,
) {
  return client
    .from("posts")
    .select(`${publicPostSummaryColumns}, author_filter:post_authors!inner(author_id)`)
    .eq("status", "published")
    .eq("author_filter.author_id", authorId)
    .order("published_at", { ascending: false });
}

export const publicCategoryColumns = "id, name, slug, description, parent_id, sort_order";

export function selectCategories(client: SupabaseClient) {
  return client
    .from("categories")
    .select(publicCategoryColumns)
    .order("sort_order")
    .order("name");
}

export function selectTagBySlug(client: SupabaseClient, slug: string) {
  return client
    .from("tags")
    .select("id, name, slug, description")
    .eq("slug", slug)
    .maybeSingle();
}

// RLS exposes an author only while they are credited on a visible post, and
// never exposes authors.user_id.
export function selectAuthorBySlug(client: SupabaseClient, slug: string) {
  return client
    .from("authors")
    .select("id, name, slug, bio")
    .eq("slug", slug)
    .maybeSingle();
}
