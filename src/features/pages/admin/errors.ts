// RPC errors of the page and menu mutations to message keys under
// adminPages.errors. Also used as the ?error= value on /admin/pages/[id], so
// it lives outside the Server Action module (which may export only async
// functions).
export const pageActionErrorKeys = [
  "forbidden",
  "conflict",
  "slug",
  "kind",
  "body",
  "title",
  "metaDescription",
  "state",
  "missing",
  "linked",
  "rateLimited",
  "invalidInput",
  "failed",
] as const;

export type PageActionErrorKey = (typeof pageActionErrorKeys)[number];

export function pageActionErrorKey(
  error: { code?: string; message?: string } | null,
): PageActionErrorKey {
  const message = error?.message ?? "";

  switch (error?.code) {
    case "42501":
      return "forbidden";
    case "40001":
      return "conflict";
    case "23505":
      return message.includes("kind") ? "kind" : "slug";
    case "23503":
      return "linked";
    case "55000":
      return "state";
    case "P0002":
      return "missing";
    case "PT429":
      return "rateLimited";
    case "22023":
    case "23514":
      if (message.includes("post body") || message.includes("content version")) return "body";
      if (message.includes("Title")) return "title";
      if (message.includes("Meta description")) return "metaDescription";
      if (message.includes("slug")) return "slug";
      return "invalidInput";
    default:
      return "failed";
  }
}

// Untrusted ?error= value to a known key, or null.
export function parsePageActionErrorKey(value: unknown): PageActionErrorKey | null {
  return typeof value === "string" && (pageActionErrorKeys as readonly string[]).includes(value)
    ? (value as PageActionErrorKey)
    : null;
}
