"use client";

import { createBrowserClient } from "@supabase/ssr";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import { getSupabaseEnvironment } from "./env";

let authClient: SupabaseClient | undefined;
let publicClient: SupabaseClient | undefined;

// Cookie-based client for signed-in browser interactions. Reads only the
// publishable key; authorization still happens on the server.
export function createBrowserAuthSupabaseClient() {
  const { url, publishableKey } = getSupabaseEnvironment();

  authClient ??= createBrowserClient(url, publishableKey);

  return authClient;
}

// Dedicated client for the invitation redirect. Supabase's default invite flow
// returns the session in the URL fragment, so this client must not try to
// auto-detect a PKCE code before the page reads and applies the fragment.
export function createInviteConfirmationSupabaseClient() {
  const { url, publishableKey } = getSupabaseEnvironment();

  return createBrowserClient(url, publishableKey, {
    auth: { detectSessionInUrl: false },
  });
}

// Anonymous client for public reads. It never carries a signed-in session.
export function createPublicBrowserSupabaseClient() {
  const { url, publishableKey } = getSupabaseEnvironment();

  publicClient ??= createClient(url, publishableKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });

  return publicClient;
}

// Kept for existing public-only call sites; use the auth client for anything
// that depends on a signed-in user.
export const createBrowserSupabaseClient = createPublicBrowserSupabaseClient;
