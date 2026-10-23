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
