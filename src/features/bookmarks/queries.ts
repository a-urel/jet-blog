import type { SupabaseClient } from "@supabase/supabase-js";

import {
  mapPublicPostSummary,
  publicPostSummaryColumns,
  type RawPublicPost,
} from "@/features/posts/mapping";
import type { PostSummary } from "@/features/posts/types";

// The private saved list, shared by the server data boundary (data.ts) and the
// RLS tests. RLS limits the rows to the caller's own bookmarks; the user_id
// filter matches the (user_id, created_at) index.
//
// The post embed is an inner join filtered to published posts, so a post that
// was unpublished after it was saved drops out of the list entirely. The status
// filter is required, not defense in depth: editorial members can read drafts
// through the posts policy.
export function selectSavedPosts(client: SupabaseClient, userId: string) {
  return client
    .from("bookmarks")
    .select(`created_at, post:posts!inner(${publicPostSummaryColumns})`)
    .eq("user_id", userId)
    .eq("post.status", "published")
    .order("created_at", { ascending: false });
}

type RawSavedRow = {
  created_at: string;
  post: RawPublicPost | RawPublicPost[] | null;
};

// Rows whose post cannot be shown publicly are dropped, never rendered partly.
export function mapSavedRows(rows: unknown[] | null): PostSummary[] {
  return ((rows ?? []) as RawSavedRow[]).flatMap((row) => {
    const raw = Array.isArray(row.post) ? row.post[0] : row.post;
    const post = raw ? mapPublicPostSummary(raw) : null;
    return post ? [post] : [];
  });
}
