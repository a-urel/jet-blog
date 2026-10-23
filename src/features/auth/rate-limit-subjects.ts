import { createHash } from "node:crypto";

// Subjects for the Auth flow rate limits. The database stores only these
// SHA-256 digests, never the raw email or IP address.
export type AuthRateLimitSubjects = Readonly<{
  emailHash: string | null;
  ipHash: string | null;
}>;

function digest(kind: string, value: string) {
  return createHash("sha256").update(`${kind}:${value}`).digest("hex");
}

export function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

// The first X-Forwarded-For entry is the client as seen by the outermost proxy.
// The header is only trustworthy behind a proxy that overwrites it; see the
// README rate-limit notes before deploying.
export function clientIpFromHeaders(headers: Pick<Headers, "get">): string | null {
  const forwarded = headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  if (forwarded) return forwarded;

  const realIp = headers.get("x-real-ip")?.trim();
  return realIp || null;
}

export function authRateLimitSubjects(
  email: string | null,
  ip: string | null,
): AuthRateLimitSubjects {
  const normalizedEmail = email ? normalizeEmail(email) : "";

  return {
    emailHash: normalizedEmail ? digest("email", normalizedEmail) : null,
    ipHash: ip ? digest("ip", ip) : null,
  };
}
