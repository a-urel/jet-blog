import "server-only";

import { createServerSupabaseClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/env";

export type SessionUser = Readonly<{
  id: string;
  email: string | null;
}>;

// Verifies the access token through Supabase. Never trust getSession() here:
// it reads a cookie that a client can forge.
export async function getSessionUser(): Promise<SessionUser | null> {
  if (!isSupabaseConfigured()) return null;

  try {
    const supabase = await createServerSupabaseClient();
    const { data, error } = await supabase.auth.getClaims();

    if (error || !data?.claims) return null;

    const { claims } = data;
    if (typeof claims.sub !== "string" || claims.sub.length === 0) return null;

    return {
      id: claims.sub,
      email: typeof claims.email === "string" ? claims.email : null,
    };
  } catch {
    // Treat an unverifiable session as signed out.
    return null;
  }
}
