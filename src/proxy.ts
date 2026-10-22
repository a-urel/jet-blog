import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

import {
  getSupabaseEnvironment,
  isSupabaseConfigured,
} from "@/lib/supabase/env";

export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });

  // Public pages keep working on a checkout without Supabase credentials.
  if (!isSupabaseConfigured()) return response;

  const { url, publishableKey } = getSupabaseEnvironment();

  const supabase = createServerClient(url, publishableKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet, headers) {
        cookiesToSet.forEach(({ name, value }) => {
          request.cookies.set(name, value);
        });

        response = NextResponse.next({ request });

        cookiesToSet.forEach(({ name, value, options }) => {
          response.cookies.set(name, value, options);
        });

        Object.entries(headers).forEach(([key, value]) => {
          response.headers.set(key, value);
        });
      },
    },
  });

  try {
    // Refreshes expired tokens and verifies the session before rendering.
    await supabase.auth.getClaims();
  } catch {
    // Pages verify the session themselves and fail closed.
  }

  return response;
}

export const config = {
  matcher: ["/admin/:path*", "/giris", "/giris/:path*"],
};
