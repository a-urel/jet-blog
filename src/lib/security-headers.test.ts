import { describe, expect, it } from "vitest";

import {
  buildContentSecurityPolicy,
  buildSecurityHeaders,
  youtubeEmbedOrigin,
} from "./security-headers";

function directives(policy: string): Map<string, string[]> {
  return new Map(
    policy.split("; ").map((directive) => {
      const [name, ...sources] = directive.split(" ");
      return [name, sources];
    }),
  );
}

describe("buildContentSecurityPolicy", () => {
  const hosted = directives(
    buildContentSecurityPolicy({
      supabaseUrl: "https://project.supabase.co/",
      isDevelopment: false,
    }),
  );

  it("allows only YouTube nocookie frames and no framing of the site", () => {
    expect(hosted.get("frame-src")).toEqual([youtubeEmbedOrigin]);
    expect(hosted.get("frame-ancestors")).toEqual(["'none'"]);
    expect(hosted.get("object-src")).toEqual(["'none'"]);
  });

  it("allows the Supabase origin for media and the browser Auth client", () => {
    expect(hosted.get("img-src")).toContain("https://project.supabase.co");
    expect(hosted.get("connect-src")).toContain("https://project.supabase.co");
    expect(hosted.get("script-src")).not.toContain("https://project.supabase.co");
  });

  it("keeps eval and websockets out of production", () => {
    expect(hosted.get("script-src")).toEqual(["'self'", "'unsafe-inline'"]);
    expect(hosted.get("connect-src")).not.toContain("ws:");
    expect(hosted.has("upgrade-insecure-requests")).toBe(true);
  });

  it("relaxes only what development tooling needs", () => {
    const dev = directives(
      buildContentSecurityPolicy({
        supabaseUrl: "http://127.0.0.1:54321",
        isDevelopment: true,
      }),
    );

    expect(dev.get("script-src")).toContain("'unsafe-eval'");
    expect(dev.get("connect-src")).toContain("ws:");
    expect(dev.get("img-src")).toContain("http://127.0.0.1:54321");
    // A local http stack must not be upgraded to https.
    expect(dev.has("upgrade-insecure-requests")).toBe(false);
  });

  it("works without Supabase configuration", () => {
    const bare = directives(buildContentSecurityPolicy({ isDevelopment: false }));

    expect(bare.get("img-src")).toEqual(["'self'", "blob:", "data:"]);
    expect(bare.has("upgrade-insecure-requests")).toBe(false);
    expect(
      directives(buildContentSecurityPolicy({ supabaseUrl: "not a url", isDevelopment: false }))
        .get("connect-src"),
    ).toEqual(["'self'"]);
  });
});

describe("buildSecurityHeaders", () => {
  it("sends the baseline headers", () => {
    const headers = new Map(
      buildSecurityHeaders({ isDevelopment: false }).map(({ key, value }) => [key, value]),
    );

    expect(headers.get("X-Content-Type-Options")).toBe("nosniff");
    expect(headers.get("Referrer-Policy")).toBe("strict-origin-when-cross-origin");
    expect(headers.get("X-Frame-Options")).toBe("DENY");
    expect(headers.has("Strict-Transport-Security")).toBe(false);
  });
});
