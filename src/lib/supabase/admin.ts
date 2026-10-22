import "server-only";

import { createClient } from "@supabase/supabase-js";

import { getSupabaseEnvironment, getSupabaseSecretKey } from "./env";

// Server-only admin client. It uses the secret key and bypasses RLS, so never
// import this module from a Client Component or route it through user input.
export function createAdminSupabaseClient() {
  const { url } = getSupabaseEnvironment();
  const secretKey = getSupabaseSecretKey();

  return createClient(url, secretKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
      detectSessionInUrl: false,
    },
  });
}
