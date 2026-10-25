import type { EditorialMembership } from "@/lib/auth/editorial";
import type { PostStatus } from "./types";

export type PostPermissionTarget = Readonly<{
  status: PostStatus;
  createdBy: string | null;
}>;

// Editors and admins may edit any post. Authors may edit only their own posts:
// drafts, and since Phase 26 the working copy of their published posts (the
// public page changes only when an editor republishes). A credit is not an
// edit permission. update_post_metadata enforces the same rule.
export function canEditPost(
  post: PostPermissionTarget,
  membership: EditorialMembership | null,
  userId: string,
): boolean {
  if (!membership) return false;
  if (membership.role === "admin" || membership.role === "editor") return true;

  return membership.role === "author" && post.createdBy === userId;
}

// Resetting a published post's working copy to its published snapshot is an
// edit: whoever may edit the post may discard its unpublished changes
// (discard_post_changes).
export function canDiscardChanges(
  post: PostPermissionTarget & Readonly<{ hasUnpublishedChanges: boolean }>,
  membership: EditorialMembership | null,
  userId: string,
): boolean {
  return (
    post.status === "published" &&
    post.hasUnpublishedChanges &&
    canEditPost(post, membership, userId)
  );
}

// Decision D1: editors and admins publish, republish, and unpublish; authors
// never do. The publish_post, republish_post, and unpublish_post RPCs enforce
// the same rule.
export function canPublishPosts(
  membership: EditorialMembership | null,
): boolean {
  return membership?.role === "admin" || membership?.role === "editor";
}
