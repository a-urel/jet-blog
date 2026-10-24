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

// Catalog group (adminPosts.publication.publish or .unpublish) for the
// confirmation dialog in front of publish and unpublish. Both actions change
// what anonymous readers see at once, so neither runs on the first click.
export function publicationConfirmationKey(
  published: boolean,
): "publish" | "unpublish" {
  return published ? "unpublish" : "publish";
}
