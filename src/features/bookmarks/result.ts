// Pure mapping between database errors and the bookmark action result. Kept
// free of server-only imports so unit tests can exercise it directly.

export type BookmarkResult =
  | { status: "ok"; saved: boolean }
  | { status: "unauthenticated" }
  | { status: "unavailable" }
  | { status: "rate-limited" }
  | { status: "error" };

// Catalog keys (bookmarks.messages.*) of the failures the toggle shows.
export const bookmarkMessageKeys = {
  unavailable: "unavailable",
  "rate-limited": "rateLimited",
  error: "error",
} as const;

const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isPostId(value: unknown): value is string {
  return typeof value === "string" && uuidPattern.test(value);
}

// Insert errors. A unique violation means the bookmark already exists, which
// is the requested state. A failed RLS check (42501) means the post is not
// published (or does not exist); a foreign-key failure is the same for the
// caller. Neither reveals whether a draft exists.
export function insertErrorResult(error: { code?: string }): BookmarkResult {
  switch (error.code) {
    case "23505":
      return { status: "ok", saved: true };
    case "42501":
    case "23503":
      return { status: "unavailable" };
    case "PT429":
      return { status: "rate-limited" };
    default:
      return { status: "error" };
  }
}
