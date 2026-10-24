import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

import { signInPathFor } from "@/features/auth/return-path";
import {
  getSupabaseEnvironment,
  isSupabaseConfigured,
} from "@/lib/supabase/env";

// Route groups stay separate: /admin requires an active editorial membership
// (checked by the admin layout), /account only a signed-in user. Proxy does an
// optimistic signed-out redirect for both and never decides editorial access;
// every page and Server Action re-verifies the session and membership itself.
const editorialRoutePrefix = "/admin";
const readerRoutePrefix = "/account";

function isUnder(pathname: string, prefix: string) {
  return pathname === prefix || pathname.startsWith(`${prefix}/`);
}

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

  let signedIn = false;

  try {
    // Refreshes expired tokens and verifies the session before rendering.
    const { data } = await supabase.auth.getClaims();
    signedIn = Boolean(data?.claims?.sub);
  } catch {
    // Pages verify the session themselves and fail closed.
  }

  const { pathname } = request.nextUrl;
  const protectedRoute =
    isUnder(pathname, editorialRoutePrefix) || isUnder(pathname, readerRoutePrefix);

  if (protectedRoute && !signedIn) {
    // Both route groups come back after sign-in through the validated ?next=
    // path; sign-in honors an /admin path only for an active member.
    const signInPath = signInPathFor(`${pathname}${request.nextUrl.search}`);
    const redirect = NextResponse.redirect(new URL(signInPath, request.url));
    // Keep any cookie changes (for example, a cleared invalid session).
    response.cookies.getAll().forEach((cookie) => {
      redirect.cookies.set(cookie);
    });
    return redirect;
  }

  return response;
}

export const config = {
  matcher: [
    "/admin/:path*",
    "/account/:path*",
    "/login/:path*",
    "/signup",
  ],
};
