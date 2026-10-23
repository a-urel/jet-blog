import "server-only";

import { createServerSupabaseClient } from "@/lib/supabase/server";

// Reads the caller's own profile through RLS (profiles_select_own_or_admin).
export async function getOwnProfile(userId: string) {
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase
    .from("profiles")
    .select("display_name, created_at")
    .eq("id", userId)
    .maybeSingle();

  if (error) throw error;

  return data as { display_name: string | null; created_at: string } | null;
}
