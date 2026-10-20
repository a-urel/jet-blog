import "server-only";

import { createClient } from "@supabase/supabase-js";

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
