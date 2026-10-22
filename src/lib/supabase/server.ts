import "server-only";

import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";

import { getSupabaseEnvironment } from "./env";

// Anonymous client only; never use this to authorize a signed-in user.
export function createPublicServerSupabaseClient() {
  const { url, publishableKey } = getSupabaseEnvironment();

  return createClient(url, publishableKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
}

// Request-scoped client backed by Supabase auth cookies. Create a new client
// for every request; reuse would mix sessions between users.
export async function createServerSupabaseClient() {
  const { url, publishableKey } = getSupabaseEnvironment();
  const cookieStore = await cookies();

  return createServerClient(url, publishableKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => {
            cookieStore.set(name, value, options);
          });
        } catch {
          // Server Components cannot write cookies. The Proxy refreshes and
          // writes the session cookies before rendering.
        }
      },
    },
  });
}
