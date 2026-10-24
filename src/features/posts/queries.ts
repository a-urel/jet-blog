import type { SupabaseClient } from "@supabase/supabase-js";

import { publicPostSummaryColumns } from "./mapping";

// Public read queries shared by the server data boundary (data.ts) and the
// RLS tests, which run them with a real anonymous client. They take the client
// as an argument and stay free of server-only imports. RLS is the
// authorization rule; the status filter is defense in depth.
//
// Listings count matching rows (count: "exact") so a paginated read knows the
// page count, and order by published_at with id as a tiebreaker: posts
// published in the same instant keep one order, so no post repeats or goes
// missing across pages. Callers paginate with range() (data.ts).

function selectPublishedPosts(client: SupabaseClient, columns: string) {
  return client
    .from("posts")
    .select(columns, { count: "exact" })
    .eq("status", "published")
    .order("published_at", { ascending: false })
    .order("id", { ascending: false });
}

export function selectPublishedPostSummaries(client: SupabaseClient) {
  return selectPublishedPosts(client, publicPostSummaryColumns);
}

export function selectPublishedPostsInCategories(
  client: SupabaseClient,
  categoryIds: string[],
) {
  return selectPublishedPostSummaries(client).in("category_id", categoryIds);
}

// Categories of every published post in a subtree, without paginating: the
// category archive shows which child categories have posts on any page.
export function selectPublishedPostCategoryIds(
  client: SupabaseClient,
  categoryIds: string[],
) {
  return client
    .from("posts")
    .select("category_id")
    .eq("status", "published")
    .in("category_id", categoryIds);
}

// The filter relation is a second, aliased embed so the post still carries
// all of its tags (or credits) for display.
export function selectPublishedPostsWithTag(client: SupabaseClient, tagId: string) {
  return selectPublishedPosts(
    client,
    `${publicPostSummaryColumns}, tag_filter:post_tags!inner(tag_id)`,
  ).eq("tag_filter.tag_id", tagId);
}

export function selectPublishedPostsByAuthor(
  client: SupabaseClient,
  authorId: string,
) {
  return selectPublishedPosts(
    client,
    `${publicPostSummaryColumns}, author_filter:post_authors!inner(author_id)`,
  ).eq("author_filter.author_id", authorId);
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
