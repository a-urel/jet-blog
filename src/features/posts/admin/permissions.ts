import type { EditorialMembership } from "@/lib/auth/editorial";
import type { PostStatus } from "./types";

export type PostPermissionTarget = Readonly<{
  status: PostStatus;
  createdBy: string | null;
}>;

// Editors and admins may edit any post. Authors may edit only their own drafts;
// a credit is not an edit permission and a published post is no longer theirs to
// edit.
export function canEditPost(
  post: PostPermissionTarget,
  membership: EditorialMembership | null,
  userId: string,
): boolean {
  if (!membership) return false;
  if (membership.role === "admin" || membership.role === "editor") return true;

  return (
    membership.role === "author" &&
    post.status === "draft" &&
    post.createdBy === userId
  );
}

// Decision D1: editors and admins publish and unpublish; authors never do. The
// publish_post and unpublish_post RPCs enforce the same rule.
export function canPublishPosts(
  membership: EditorialMembership | null,
): boolean {
  return membership?.role === "admin" || membership?.role === "editor";
}
