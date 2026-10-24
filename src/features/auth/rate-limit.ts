import "server-only";

import { headers } from "next/headers";

import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { isSupabaseAdminConfigured } from "@/lib/supabase/env";
import { authRateLimitSubjects, clientIpFromHeaders } from "./rate-limit-subjects";

export type AuthRateLimitAction =
  | "auth.sign_up"
  | "auth.sign_in"
  | "auth.password_reset";

export type AuthRateLimitResult = "allowed" | "limited" | "unavailable";

// A refused result doubles as its message key under auth.rateLimit.
export type AuthRateLimitRefusal = Exclude<AuthRateLimitResult, "allowed">;

// Records one attempt and reports whether it is within the database rule
// (public.consume_auth_rate_limit). The function is granted to the server's
// secret key only, so clients cannot spend another person's budget directly.
// Fails closed: without the secret key or the database, the flow is refused.
export async function consumeAuthRateLimit(
  action: AuthRateLimitAction,
  email: string | null,
): Promise<AuthRateLimitResult> {
  if (!isSupabaseAdminConfigured()) return "unavailable";

  const subjects = authRateLimitSubjects(
    email,
    clientIpFromHeaders(await headers()),
  );

  try {
    const admin = createAdminSupabaseClient();
    const { error } = await admin.rpc("consume_auth_rate_limit", {
      p_action: action,
      p_email_hash: subjects.emailHash,
      p_ip_hash: subjects.ipHash,
    });

    if (!error) return "allowed";
    return error.code === "PT429" ? "limited" : "unavailable";
  } catch {
    return "unavailable";
  }
}
