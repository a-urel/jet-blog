// Response security headers for every route, applied from next.config.ts.
//
// The CSP is static (no nonces): nonces require dynamic rendering of every
// page, which would disable the ISR public pages. Next.js inline bootstrap
// scripts therefore need 'unsafe-inline'. Editor content cannot inject scripts:
// bodies render through controlled nodes and links are scheme-checked.
//
// Allowed third parties:
//   * the Supabase origin: public media images (the editor and media library
//     use the bucket URL directly; next/image proxies through 'self') and the
//     browser Auth client on the invitation confirmation page;
//   * www.youtube-nocookie.com: the only embed provider (Phase 7).
//
// HSTS is not set here: it belongs to the TLS-terminating host or proxy and
// must not be sent from local http servers.

export const youtubeEmbedOrigin = "https://www.youtube-nocookie.com";

type SecurityHeaderOptions = {
  supabaseUrl?: string;
  isDevelopment: boolean;
};

function supabaseOrigin(raw: string | undefined): URL | null {
  const value = raw?.trim();
  if (!value) return null;

  try {
    return new URL(value);
  } catch {
    return null;
  }
}

export function isLoopbackHostname(hostname: string): boolean {
  return ["127.0.0.1", "localhost", "[::1]"].includes(hostname);
}

export function buildContentSecurityPolicy({
  supabaseUrl,
  isDevelopment,
}: SecurityHeaderOptions): string {
  const supabase = supabaseOrigin(supabaseUrl);
  const supabaseSources = supabase ? [supabase.origin] : [];

  const directives: [string, ...string[]][] = [
    ["default-src", "'self'"],
    [
      "script-src",
      "'self'",
      "'unsafe-inline'",
      // React's development build evaluates code for debugging.
      ...(isDevelopment ? ["'unsafe-eval'"] : []),
    ],
    ["style-src", "'self'", "'unsafe-inline'"],
    ["img-src", "'self'", "blob:", "data:", ...supabaseSources],
    ["font-src", "'self'"],
    [
      "connect-src",
      "'self'",
      ...supabaseSources,
      // Fast Refresh uses a websocket in development.
      ...(isDevelopment ? ["ws:"] : []),
    ],
    ["frame-src", youtubeEmbedOrigin],
    ["media-src", "'self'"],
    ["object-src", "'none'"],
    ["base-uri", "'self'"],
    ["form-action", "'self'"],
    ["frame-ancestors", "'none'"],
  ];

  // Upgrading would break a local http Supabase stack under `next start`.
  if (supabase && !isLoopbackHostname(supabase.hostname)) {
    directives.push(["upgrade-insecure-requests"]);
  }

  return directives.map((directive) => directive.join(" ")).join("; ");
}

export function buildSecurityHeaders(
  options: SecurityHeaderOptions,
): { key: string; value: string }[] {
  return [
    { key: "Content-Security-Policy", value: buildContentSecurityPolicy(options) },
    { key: "X-Content-Type-Options", value: "nosniff" },
    // YouTube embeds need the origin as referrer; full URLs stay private.
    { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
    { key: "X-Frame-Options", value: "DENY" },
    {
      key: "Permissions-Policy",
      value: "camera=(), microphone=(), geolocation=(), browsing-topics=()",
    },
  ];
}
