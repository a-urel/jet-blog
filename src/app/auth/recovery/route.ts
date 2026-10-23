import type { NextRequest } from "next/server";

import { exchangeAuthCodeAndRedirect } from "@/features/auth/code-exchange";

// Password recovery link. The exchanged session lets the user set a new
// password at /account/password.
export async function GET(request: NextRequest) {
  return exchangeAuthCodeAndRedirect(request, {
    otpTypes: ["recovery"],
    success: "/account/password?recovery=1",
    failure: "/login/reset?link=invalid",
  });
}
