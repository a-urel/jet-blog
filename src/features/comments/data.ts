import "server-only";

import { isSupabaseConfigured } from "@/lib/supabase/env";
import {
  createPublicServerSupabaseClient,
  createServerSupabaseClient,
} from "@/lib/supabase/server";
import { commentsCacheTag, publicCommentsCacheTag } from "./cache";
import {
  mapModerationQueue,
  mapPublicComments,
  selectModerationQueue,
  selectVisibleComments,
  type ModerationComment,
  type ModerationFilter,
  type PublicComment,
} from "./queries";

// Public comments of one published post, read anonymously so the post page
// stays prerenderable. Throws on failure so a transient error is not cached
// as an empty discussion. See ./cache.ts for invalidation.
export async function listVisibleComments(postId: string): Promise<PublicComment[]> {
  if (!isSupabaseConfigured()) return [];

  const client = createPublicServerSupabaseClient({
    cacheTags: [commentsCacheTag(postId), publicCommentsCacheTag],
  });
  const { data, error } = await selectVisibleComments(client, postId);

  if (error) throw new Error(`Comments could not be loaded: ${error.message}`);

  return mapPublicComments(data);
}

// Reads through the caller's session; the admin route is dynamic.
export async function listModerationQueue(
  filter: ModerationFilter,
  page: number,
): Promise<{ comments: ModerationComment[]; total: number }> {
  const supabase = await createServerSupabaseClient();
  let result = await selectModerationQueue(supabase, filter, page);

  // PostgREST answers an offset past the end with 416 (PGRST103) and no
  // count; page 1 carries the total the page needs to clamp to the last page.
  if (result.error?.code === "PGRST103" && page > 1) {
    const first = await selectModerationQueue(supabase, filter, 1);
    if (!first.error) return { comments: [], total: first.count ?? 0 };
    result = first;
  }

  if (result.error) {
    throw new Error(`Moderation queue could not be loaded: ${result.error.message}`);
  }

  return { comments: mapModerationQueue(result.data), total: result.count ?? 0 };
}
