import "server-only";

import type { EmailOtpType } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";

import { createServerSupabaseClient } from "@/lib/supabase/server";

// Redirect target for Supabase email links (sign-up confirmation and password
// recovery). Two link shapes are accepted:
//   - ?token_hash=…&type=… from a custom email template (Supabase's documented
//     SSR pattern; works in any browser). Use this for hosted projects.
//   - ?code=… from the default template with the PKCE flow. The Server Action
//     that started the flow stored the code verifier in a cookie, so the link
//     must be opened in the same browser. The local native stack cannot serve
//     custom templates, so local development uses this shape.
// Redirect targets are fixed paths, never taken from the query string.
export async function exchangeAuthCodeAndRedirect(
  request: NextRequest,
  options: {
    otpTypes: readonly EmailOtpType[];
    success: string;
    failure: string;
  },
) {
  const { searchParams } = request.nextUrl;
  const code = searchParams.get("code");
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type");
  const flowId = searchParams.get("sb_flow_id");
  const failure = NextResponse.redirect(new URL(options.failure, request.url));

  if (searchParams.has("error")) return failure;

  try {
    const supabase = await createServerSupabaseClient();

    if (tokenHash) {
      const otpType = options.otpTypes.find((allowed) => allowed === type);
      if (!otpType) return failure;

      const { error } = await supabase.auth.verifyOtp({
        type: otpType,
        token_hash: tokenHash,
      });
      if (error) return failure;
    } else if (code) {
      const { error } = await supabase.auth.exchangeCodeForSession(
        code,
        flowId ? { flowId } : undefined,
      );
      if (error) return failure;
    } else {
      return failure;
    }
  } catch {
    return failure;
  }

  return NextResponse.redirect(new URL(options.success, request.url));
}
