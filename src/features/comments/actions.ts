"use server";

import { revalidatePath, updateTag } from "next/cache";

import { getSessionUser } from "@/lib/auth/session";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { commentsCacheTag } from "./cache";
import {
  commentInsertErrorResult,
  isCommentReportReason,
  isCommentStatus,
  isUuid,
  moderationErrorResult,
  normalizeCommentBody,
  reportInsertErrorResult,
  type CommentActionResult,
} from "./model";

// Every action takes the user from the verified session; RLS and the
// moderation RPC are the authorization rules. Actions accept only ids, the
// body, a reason code, or a status, never a user id or display name.

// Expires one post's comment reads and regenerates its page. updateTag runs
// first so the regenerated page reads fresh rows (see ./cache.ts).
function invalidatePostComments(postId: string, slug: string | null) {
  updateTag(commentsCacheTag(postId));
  if (slug) revalidatePath(`/posts/${slug}`);
}

async function publishedPostSlug(
  supabase: Awaited<ReturnType<typeof createServerSupabaseClient>>,
  postId: string,
): Promise<string | null> {
  const { data } = await supabase
    .from("posts")
    .select("slug")
    .eq("id", postId)
    .eq("status", "published")
    .maybeSingle();

  return (data?.slug as string | undefined) ?? null;
}

export async function createCommentAction(
  postId: unknown,
  body: unknown,
): Promise<CommentActionResult> {
  if (!isUuid(postId) || typeof body !== "string") return { status: "error" };

  const normalized = normalizeCommentBody(body);
  if (!normalized.ok) return { status: "invalid", message: normalized.message };

  const user = await getSessionUser();
  if (!user) return { status: "unauthenticated" };

  const supabase = await createServerSupabaseClient();
  // user_id, display_name, and status come from the column default and the
  // insert trigger; the insert grant covers post_id and body only.
  const { error } = await supabase
    .from("comments")
    .insert({ post_id: postId, body: normalized.value });

  if (error) return commentInsertErrorResult(error);

  invalidatePostComments(postId, await publishedPostSlug(supabase, postId));

  return { status: "ok" };
}

export async function deleteOwnCommentAction(
  commentId: unknown,
): Promise<CommentActionResult> {
  if (!isUuid(commentId)) return { status: "error" };

  const user = await getSessionUser();
  if (!user) return { status: "unauthenticated" };

  const supabase = await createServerSupabaseClient();
  // RLS (comments_delete_own) limits the delete to the caller's rows; another
  // user's id matches nothing.
  const { data, error } = await supabase
    .from("comments")
    .delete()
    .eq("id", commentId)
    .select("post_id");

  if (error) return { status: "error" };

  const postId = data?.[0]?.post_id as string | undefined;
  if (!postId) return { status: "unavailable" };

  invalidatePostComments(postId, await publishedPostSlug(supabase, postId));

  return { status: "ok" };
}

// Reports change nothing public (no auto-hide), so nothing is invalidated
// except the moderation queue.
export async function reportCommentAction(
  commentId: unknown,
  reason: unknown,
): Promise<CommentActionResult> {
  if (!isUuid(commentId) || !isCommentReportReason(reason)) {
    return { status: "error" };
  }

  const user = await getSessionUser();
  if (!user) return { status: "unauthenticated" };

  const supabase = await createServerSupabaseClient();
  const { error } = await supabase
    .from("comment_reports")
    .insert({ comment_id: commentId, reason });

  if (error) return reportInsertErrorResult(error);

  revalidatePath("/admin/comments");

  return { status: "ok" };
}

export async function moderateCommentAction(
  commentId: unknown,
  status: unknown,
): Promise<CommentActionResult> {
  if (!isUuid(commentId) || !isCommentStatus(status)) return { status: "error" };

  const user = await getSessionUser();
  if (!user) return { status: "unauthenticated" };

  const supabase = await createServerSupabaseClient();
  // The RPC checks editorial access (is_editor) and the allowed transition.
  const { data, error } = await supabase.rpc("moderate_comment", {
    p_comment_id: commentId,
    p_status: status,
  });

  if (error) return moderationErrorResult(error);

  const post = (data as { post_id: string; post_slug: string }[] | null)?.[0];
  if (post) invalidatePostComments(post.post_id, post.post_slug);
  revalidatePath("/admin/comments");

  return { status: "ok" };
}
