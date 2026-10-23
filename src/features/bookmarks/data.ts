import "server-only";

import type { PostSummary } from "@/features/posts/types";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { mapSavedRows, selectSavedPosts } from "./queries";

// Reads through the caller's session (cookies), so the route that calls it is
// dynamic and never enters a shared cache. Throws on failure so the page can
// show its error state instead of an empty list.
export async function listSavedPosts(userId: string): Promise<PostSummary[]> {
  const supabase = await createServerSupabaseClient();
  const { data, error } = await selectSavedPosts(supabase, userId);

  if (error) throw new Error(`Saved posts could not be loaded: ${error.message}`);

  return mapSavedRows(data);
}
