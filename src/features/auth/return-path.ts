// Sign-in return paths arrive from the query string (?next=), so they are
// untrusted. Only same-origin, absolute paths to public, reader, or editorial
// pages are accepted; anything else falls back to the role-based home path.
// An editorial path is honored only for active members (see
// returnPathForMember), so a reader never lands on the access-denied view.

const maxReturnPathLength = 512;

// Auth pages would loop or act on a stale state.
const refusedPrefixes = ["/login", "/signup", "/auth", "/api"];

const editorialPrefix = "/admin";

export function safeReturnPath(value: unknown): string | null {
  if (typeof value !== "string") return null;
  if (value.length === 0 || value.length > maxReturnPathLength) return null;
  // "//host" and "/\host" are protocol-relative in browsers.
  if (!value.startsWith("/") || value.startsWith("//") || value.startsWith("/\\")) {
    return null;
  }
  // Control characters and backslashes have no place in our paths.
  if (/[\u0000-\u001f\u007f\\]/.test(value)) return null;

  let url: URL;
  try {
    url = new URL(value, "http://return-path.invalid");
  } catch {
    return null;
  }

  if (url.origin !== "http://return-path.invalid") return null;

  const path = url.pathname;
  if (
    refusedPrefixes.some(
      (prefix) => path === prefix || path.startsWith(`${prefix}/`),
    )
  ) {
    return null;
  }

  return `${path}${url.search}`;
}

export function isEditorialPath(path: string): boolean {
  const pathname = path.split("?")[0];
  return pathname === editorialPrefix || pathname.startsWith(`${editorialPrefix}/`);
}

// The validated return path for a signed-in user, or null for the role-based
// home path: an editorial path is dropped for someone without a membership.
export function returnPathForMember(value: unknown, isMember: boolean): string | null {
  const safe = safeReturnPath(value);
  if (!safe) return null;
  return isEditorialPath(safe) && !isMember ? null : safe;
}

export function signInPathFor(returnPath: string): string {
  const safe = safeReturnPath(returnPath);
  return safe ? `/login?next=${encodeURIComponent(safe)}` : "/login";
}
