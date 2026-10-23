import type { NextConfig } from "next";

import { mediaPublicPath } from "./src/features/media/url";
import { buildSecurityHeaders, isLoopbackHostname } from "./src/lib/security-headers";

// Public media lives in the Supabase Storage bucket chosen by decision D4. Only
// that bucket path is allowed as a remote image source.
function mediaRemotePatterns(): NonNullable<NextConfig["images"]>["remotePatterns"] {
  const raw = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  if (!raw) return [];

  const url = new URL(raw);

  return [
    {
      protocol: url.protocol === "http:" ? "http" : "https",
      hostname: url.hostname,
      port: url.port,
      pathname: `${mediaPublicPath("")}**`,
      search: "",
    },
  ];
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
    // Uploads are capped at 5 MiB (src/features/media/validation.ts).
    maximumResponseBody: 6_000_000,
    dangerouslyAllowLocalIP: isLoopbackSupabase(),
  },
  experimental: {
    serverActions: {
      // Media uploads are sent to a Server Action: 5 MiB plus multipart
      // overhead. Other actions keep small payloads.
      bodySizeLimit: "6mb",
    },
  },
};

export default nextConfig;
