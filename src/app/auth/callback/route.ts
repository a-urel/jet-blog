import type { NextRequest } from "next/server";

import { exchangeAuthCodeAndRedirect } from "@/features/auth/code-exchange";

// Sign-up confirmation link. Supabase confirms the email before redirecting
// here, so a failed exchange (for example, the link opened in another browser)
// still leaves a confirmed account that can sign in at /login.
export async function GET(request: NextRequest) {
  return exchangeAuthCodeAndRedirect(request, {
    otpTypes: ["signup", "email"],
    success: "/account?confirmed=1",
    failure: "/login?confirm=failed",
  });
}
