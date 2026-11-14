import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

import { avatarPublicPath } from "./src/features/avatars/url";
import { mediaPublicPath } from "./src/features/media/url";
import { firstPageRedirects } from "./src/features/posts/pagination";
import { buildSecurityHeaders, isLoopbackHostname } from "./src/lib/security-headers";

// Public media lives in the Supabase Storage bucket chosen by decision D4, and
// avatars in their own public bucket. Only those two bucket paths are allowed
// as remote image sources.
function mediaRemotePatterns(): NonNullable<NextConfig["images"]>["remotePatterns"] {
  const raw = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  if (!raw) return [];

  const url = new URL(raw);

  return [mediaPublicPath(""), avatarPublicPath("")].map((path) => ({
    protocol: url.protocol === "http:" ? "http" : "https",
    hostname: url.hostname,
    port: url.port,
    pathname: `${path}**`,
    search: "",
  }));
}

// The local Supabase stack listens on a loopback address, which the image
// optimizer refuses by default to prevent SSRF. Allow it only when the
// configured Supabase URL itself is loopback (local development and builds).
function isLoopbackSupabase(): boolean {
  const raw = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  if (!raw) return false;

  return isLoopbackHostname(new URL(raw).hostname);
}

const nextConfig: NextConfig = {
  poweredByHeader: false,
  // CSP and baseline security headers; see src/lib/security-headers.ts.
  async headers() {
    return [
      {
        source: "/:path*",
        headers: buildSecurityHeaders({
          supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL,
          isDevelopment: process.env.NODE_ENV === "development",
        }),
      },
    ];
  },
  // Page 1 of a listing has a single URL; see src/features/posts/pagination.ts.
  async redirects() {
    return firstPageRedirects;
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
  images: {
    remotePatterns: mediaRemotePatterns(),
    // New uploads are capped at 4 MiB (src/features/media/validation.ts);
    // images registered before that change may be up to 5 MiB.
    maximumResponseBody: 6_000_000,
    dangerouslyAllowLocalIP: isLoopbackSupabase(),
  },
  experimental: {
    serverActions: {
      // Media uploads are sent to a Server Action: 4 MiB plus multipart
      // overhead. Other actions keep small payloads.
      bodySizeLimit: "5mb",
    },
  },
};

// Points next-intl at src/i18n/request.ts (message catalogs and the locale of
// each request). Locale routing itself lives in src/proxy.ts.
const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

export default withNextIntl(nextConfig);
