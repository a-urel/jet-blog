// Error keys for ?error= on the admin post page. Kept out of the Server Action
// module, which may export only async functions. The page translates them
// through publicationErrorMessageKey.
export type PublicationErrorKey =
  | "forbidden"
  | "conflict"
  | "category"
  | "cover"
  | "body"
  | "state"
  | "missing"
  | "rate-limited"
  | "failed";

export function publicationErrorKey(error: {
  code?: string;
  message?: string;
} | null): PublicationErrorKey {
  switch (error?.code) {
    case "42501":
      return "forbidden";
    case "40001":
      return "conflict";
    case "23514":
      return error.message?.includes("Cover") ? "cover" : "category";
    case "22023":
      if (error.message?.includes("cover")) return "cover";
      return error.message?.includes("post body") ||
        error.message?.includes("content version")
        ? "body"
        : "failed";
    case "55000":
      return "state";
    case "P0002":
      return "missing";
    case "PT429":
      return "rate-limited";
    default:
      return "failed";
  }
}

// Catalog key under adminPosts.publication.errors for each URL error key.
// Message keys are camelCase; the URL keeps its established spelling.
export type PublicationErrorMessageKey =
  | Exclude<PublicationErrorKey, "rate-limited">
  | "rateLimited";

const publicationErrorMessageKeys: Record<PublicationErrorKey, PublicationErrorMessageKey> = {
  forbidden: "forbidden",
  conflict: "conflict",
  category: "category",
  cover: "cover",
  body: "body",
  state: "state",
  missing: "missing",
  "rate-limited": "rateLimited",
  failed: "failed",
};

// Untrusted ?error= value to a catalog key, or null for anything unknown.
export function publicationErrorMessageKey(
  value: unknown,
): PublicationErrorMessageKey | null {
  return typeof value === "string" && Object.hasOwn(publicationErrorMessageKeys, value)
    ? publicationErrorMessageKeys[value as PublicationErrorKey]
    : null;
}

// A publication action and its catalog group under adminPosts.publication.
// Each runs behind a confirmation dialog (PublicationControl).
export type PublicationAction = "publish" | "unpublish" | "republish" | "discard";

// The actions the post page offers, in display order. A draft can be
// published. A published post can be republished when its working copy has
// unpublished changes, those changes can be discarded, and it can be
// unpublished. Publishing, republishing, and unpublishing need an editor or
// admin (D1); discarding follows the edit rule (an author on an own post).
// The RPCs enforce the same rules.
export function availablePublicationActions(post: {
  published: boolean;
  hasUnpublishedChanges: boolean;
  canPublish: boolean;
  canDiscard: boolean;
}): PublicationAction[] {
  if (!post.published) return post.canPublish ? ["publish"] : [];

  const actions: PublicationAction[] = [];
  if (post.canPublish && post.hasUnpublishedChanges) actions.push("republish");
  if (post.canDiscard && post.hasUnpublishedChanges) actions.push("discard");
  if (post.canPublish) actions.push("unpublish");
  return actions;
}
