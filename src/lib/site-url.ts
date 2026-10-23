// Public site origin from NEXT_PUBLIC_SITE_URL (decision D5 keeps it
// provisional until launch). Returns null when it is missing or not HTTP(S),
// so callers decide their own fallback.
export function getConfiguredSiteUrl(
  value: string | undefined = process.env.NEXT_PUBLIC_SITE_URL,
): URL | null {
  const trimmed = value?.trim();
  if (!trimmed) return null;

  try {
    const parsed = new URL(trimmed);
    return parsed.protocol === "http:" || parsed.protocol === "https:"
      ? new URL(parsed.origin)
      : null;
  } catch {
    return null;
  }
}

// Absolute URL for a site path, or null without a configured site origin.
// Sitemap entries, JSON-LD, and share links need absolute URLs.
export function absoluteSiteUrl(
  path: string,
  siteUrl: URL | null = getConfiguredSiteUrl(),
): string | null {
  return siteUrl ? new URL(path, siteUrl).href : null;
}

// Provisional publication name (D5: brand is still open). Configurable through
// NEXT_PUBLIC_SITE_NAME so no brand is hardcoded into application logic.
export const defaultSiteName = "Yazılar";

export function getSiteName(
  value: string | undefined = process.env.NEXT_PUBLIC_SITE_NAME,
): string {
  return value?.trim() || defaultSiteName;
}
