import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

import { signInPathFor } from "@/features/auth/return-path";
import {
  localeCookieName,
  localeRequestHeader,
  resolveInterfaceLocale,
  type InterfaceLocale,
} from "@/lib/interface-locales";
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
// Routes that read or refresh the Supabase session in the proxy.
const sessionRoutePrefixes = [editorialRoutePrefix, readerRoutePrefix, "/login", "/signup"];

function isUnder(pathname: string, prefix: string) {
  return pathname === prefix || pathname.startsWith(`${prefix}/`);
}

// Every page lives under the internal [locale] segment (src/app/[locale]).
// Public URLs never carry the locale: the request is rewritten to
// /<locale><path>, so each locale has its own prerendered or ISR copy while
// /posts/[slug] stays the one canonical URL. A request for an internal path
// such as /en/posts/x becomes /<locale>/en/posts/x and ends in the 404 page.
function localizedRewrite(request: NextRequest, locale: InterfaceLocale) {
  const url = request.nextUrl.clone();
  url.pathname = `/${locale}${url.pathname === "/" ? "" : url.pathname}`;

  // Server Actions cannot read the [locale] root parameter; they read this
  // header (src/i18n/request.ts). It always overwrites a client-sent value.
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set(localeRequestHeader, locale);

  // The same URL renders per locale cookie and Accept-Language, but no Vary
  // header says so: Next.js 16 overwrites Vary on every App Router page
  // response (its own RSC headers). Shared caches must key on the locale
  // cookie themselves; see the README hosting checklist.
  return NextResponse.rewrite(url, { request: { headers: requestHeaders } });
}

export async function proxy(request: NextRequest) {
  const locale = resolveInterfaceLocale(
    request.cookies.get(localeCookieName)?.value,
    request.headers.get("accept-language"),
  );
  let response = localizedRewrite(request, locale);

  const { pathname } = request.nextUrl;
  const sessionRoute = sessionRoutePrefixes.some((prefix) => isUnder(pathname, prefix));

  // Public pages never touch the session here, and keep working on a
  // checkout without Supabase credentials.
  if (!sessionRoute || !isSupabaseConfigured()) return response;

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

        response = localizedRewrite(request, locale);

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
    // Every page. Skipped: Next.js internals, files with an extension
    // (feed.xml, sitemap.xml, robots.txt, favicon.ico, static assets), the
    // auth Route Handlers, and the site-wide social image, which all live
    // outside the [locale] segment.
    "/((?!_next/|auth/callback|auth/recovery|opengraph-image|.*\\.).*)",
  ],
};
