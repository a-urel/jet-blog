// Social profile links shown in the footer and declared as JSON-LD sameAs.
// A fixed provider allowlist keeps the form, the icons, and the database
// check (public.is_valid_site_social_links) in step. Every link must be an
// https URL; provider links must point at that provider's own host, so a
// "GitHub" link cannot lead elsewhere. "website" and "mastodon" (any
// instance) accept any public https host.

export const socialProviders = [
  "website",
  "x",
  "bluesky",
  "mastodon",
  "github",
  "linkedin",
  "instagram",
  "facebook",
  "youtube",
] as const;

export type SocialProvider = (typeof socialProviders)[number];

export type SocialLinks = Partial<Record<SocialProvider, string>>;

export const maxSocialUrlLength = 300;

// Brand names are proper nouns, not interface copy.
export const socialProviderNames: Record<Exclude<SocialProvider, "website">, string> = {
  x: "X",
  bluesky: "Bluesky",
  mastodon: "Mastodon",
  github: "GitHub",
  linkedin: "LinkedIn",
  instagram: "Instagram",
  facebook: "Facebook",
  youtube: "YouTube",
};

const providerHosts: Record<SocialProvider, readonly string[] | null> = {
  website: null,
  mastodon: null,
  x: ["x.com", "twitter.com"],
  bluesky: ["bsky.app"],
  github: ["github.com"],
  linkedin: ["linkedin.com"],
  instagram: ["instagram.com"],
  facebook: ["facebook.com"],
  youtube: ["youtube.com"],
};

export function isSocialProvider(value: unknown): value is SocialProvider {
  return typeof value === "string" && (socialProviders as readonly string[]).includes(value);
}

function hostMatches(host: string, allowed: readonly string[]): boolean {
  return allowed.some((domain) => host === domain || host === `www.${domain}`);
}

export type SocialUrlIssue = "invalid" | "notHttps" | "wrongHost" | "tooLong";

// Returns the normalized URL (URL.href), or the reason it was refused. Empty
// input means "no link" and is handled by the caller.
export function validateSocialUrl(
  provider: SocialProvider,
  value: string,
): { ok: true; url: string } | { ok: false; issue: SocialUrlIssue } {
  const trimmed = value.trim();
  if (trimmed.length > maxSocialUrlLength) return { ok: false, issue: "tooLong" };

  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    return { ok: false, issue: "invalid" };
  }

  if (url.protocol !== "https:") return { ok: false, issue: "notHttps" };
  // Credentials and non-public hosts have no place in a public profile link.
  if (url.username || url.password || !url.hostname.includes(".")) {
    return { ok: false, issue: "invalid" };
  }

  const allowed = providerHosts[provider];
  if (allowed && !hostMatches(url.hostname.toLowerCase(), allowed)) {
    return { ok: false, issue: "wrongHost" };
  }

  if (url.href.length > maxSocialUrlLength) return { ok: false, issue: "tooLong" };
  return { ok: true, url: url.href };
}

// Stored links in allowlist order, re-validated on read, so a row edited out
// of band never renders an unexpected scheme or host.
export function socialLinkEntries(links: unknown): { provider: SocialProvider; url: string }[] {
  if (!links || typeof links !== "object" || Array.isArray(links)) return [];
  const record = links as Record<string, unknown>;

  return socialProviders.flatMap((provider) => {
    const value = record[provider];
    if (typeof value !== "string") return [];
    const result = validateSocialUrl(provider, value);
    return result.ok ? [{ provider, url: result.url }] : [];
  });
}
