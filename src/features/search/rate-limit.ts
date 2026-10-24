import "server-only";

import { headers } from "next/headers";

import { authRateLimitSubjects, clientIpFromHeaders } from "@/features/auth/rate-limit-subjects";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { isSupabaseAdminConfigured } from "@/lib/supabase/env";

export type SearchRateLimitResult = "allowed" | "limited" | "unavailable";

// Requests without a client address (no X-Forwarded-For or X-Real-IP) share
// one bucket instead of going unlimited.
const unknownClient = "unknown";

// Records one search and reports whether it is within the database rule
// (search.query in public.consume_auth_rate_limit: 30 per IP per minute).
// Same hashed-subject mechanism and X-Forwarded-For caveat as the Auth flow
// limits (src/features/auth/rate-limit.ts). Fails closed like them.
export async function consumeSearchRateLimit(): Promise<SearchRateLimitResult> {
  if (!isSupabaseAdminConfigured()) return "unavailable";

  const { ipHash } = authRateLimitSubjects(
    null,
    clientIpFromHeaders(await headers()) ?? unknownClient,
  );

  try {
    const admin = createAdminSupabaseClient();
    const { error } = await admin.rpc("consume_auth_rate_limit", {
      p_action: "search.query",
      p_email_hash: null,
      p_ip_hash: ipHash,
    });

    if (!error) return "allowed";
    return error.code === "PT429" ? "limited" : "unavailable";
  } catch {
    return "unavailable";
  }
}
