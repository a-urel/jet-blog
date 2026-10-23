import "server-only";

import { headers } from "next/headers";

import { getConfiguredSiteUrl } from "@/lib/site-url";

// Origin for Auth email redirects (invitations, sign-up confirmation, password
// reset). Falls back to the request origin when the public site URL is invalid.
// Every redirect target must also be on the Supabase Auth redirect allowlist.
export async function getAppOrigin() {
  const configuredSiteUrl = getConfiguredSiteUrl();
  if (configuredSiteUrl) return configuredSiteUrl.origin;

  const headerStore = await headers();
  const origin = headerStore.get("origin");

  if (origin) {
    const parsed = new URL(origin);
    if (parsed.protocol === "http:" || parsed.protocol === "https:") {
      return parsed.origin;
    }
  }

  const forwardedHost =
    headerStore.get("x-forwarded-host") ?? headerStore.get("host");
  const forwardedProto = headerStore.get("x-forwarded-proto") ?? "http";

  if (forwardedHost) {
    return `${forwardedProto}://${forwardedHost}`;
  }

  throw new Error("Could not determine the application origin.");
}
