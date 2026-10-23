"use server";

import { getSessionUser } from "@/lib/auth/session";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { insertErrorResult, isPostId, type BookmarkResult } from "./result";

// Sets the caller's bookmark for one post to the requested state. Idempotent,
// so a retried or duplicated request cannot flip the state twice.
//
// The user comes from the verified session and RLS pins every row to
// auth.uid(); the action accepts only the post id. It revalidates nothing: no
// cached public output depends on bookmarks, and the saved list is dynamic.
export async function setBookmarkAction(
  postId: unknown,
  saved: unknown,
): Promise<BookmarkResult> {
  if (!isPostId(postId) || typeof saved !== "boolean") {
    return { status: "error" };
  }

  const user = await getSessionUser();
  if (!user) return { status: "unauthenticated" };

  const supabase = await createServerSupabaseClient();

  if (saved) {
    const { error } = await supabase
      .from("bookmarks")
      .insert({ post_id: postId });

    return error ? insertErrorResult(error) : { status: "ok", saved: true };
  }

  const { error } = await supabase
    .from("bookmarks")
    .delete()
    .eq("user_id", user.id)
    .eq("post_id", postId);

  return error ? { status: "error" } : { status: "ok", saved: false };
}
