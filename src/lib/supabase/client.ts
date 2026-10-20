"use client";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import { getSupabaseEnvironment } from "./env";

let client: SupabaseClient | undefined;

// Public-only until the cookie-based SSR authentication slice is implemented.
export function createBrowserSupabaseClient() {
  const { url, publishableKey } = getSupabaseEnvironment();

  client ??= createClient(url, publishableKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });

  return client;
}
