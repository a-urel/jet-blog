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
// The post embed is an inner join on the published snapshot (published_post
// is a computed relationship), so a post that was unpublished after it was
// saved drops out of the list entirely, and a member never sees a working copy
// here.
export function selectSavedPosts(client: SupabaseClient, userId: string) {
  return client
    .from("bookmarks")
    .select(`created_at, post:published_post!inner(${publicPostSummaryColumns})`)
    .eq("user_id", userId)
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
