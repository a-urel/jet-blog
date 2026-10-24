import "server-only";

import { createClient } from "@supabase/supabase-js";

import { getSupabaseEnvironment, getSupabaseSecretKey } from "./env";

// Server-only admin client. It uses the secret key and bypasses RLS, so never
// import this module from a Client Component or route it through user input.
// noStore keeps its responses out of the Next.js Data Cache (search reads).
export function createAdminSupabaseClient(options: { noStore?: boolean } = {}) {
  const { url } = getSupabaseEnvironment();
  const secretKey = getSupabaseSecretKey();

  return createClient(url, secretKey, {
    global: options.noStore
      ? {
          fetch: (input, init) => fetch(input, { ...init, cache: "no-store" }),
        }
      : undefined,
    auth: {
      autoRefreshToken: false,
      persistSession: false,
      detectSessionInUrl: false,
    },
  });
}
