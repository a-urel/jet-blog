import "server-only";

import { cache } from "react";

import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getSessionUser, type SessionUser } from "./session";

export type EditorialRole = "admin" | "editor" | "author";

export type EditorialMembership = Readonly<{
  role: EditorialRole;
}>;

export type EditorialContext = Readonly<{
  user: SessionUser | null;
  membership: EditorialMembership | null;
}>;

const editorialRoles: EditorialRole[] = ["admin", "editor", "author"];

export function isEditorialRole(value: unknown): value is EditorialRole {
  return (
    typeof value === "string" &&
    (editorialRoles as readonly string[]).includes(value)
  );
}

// Reads the current user's membership once per request. Deactivated members are
// treated as non-members on the next request; no token refresh is required.
export const getEditorialContext = cache(
  async (): Promise<EditorialContext> => {
    const user = await getSessionUser();
    if (!user) return { user: null, membership: null };

    try {
      const supabase = await createServerSupabaseClient();
      const { data, error } = await supabase
        .from("editorial_members")
        .select("role, deactivated_at")
        .eq("profile_id", user.id)
        .maybeSingle();

      if (error || !data) return { user, membership: null };

      if (!isEditorialRole(data.role)) {
        return { user, membership: null };
      }

      // A deactivated member is a reader for authorization purposes.
      if (typeof data.deactivated_at === "string") {
        return { user, membership: null };
      }

      return {
        user,
        membership: {
          role: data.role,
        },
      };
    } catch {
      return { user, membership: null };
    }
  },
);

export function canManageMembership(
  membership: EditorialMembership | null,
): boolean {
  return membership?.role === "admin";
}

// D1: only admins manage categories and tags; editors assign existing ones.
export function canManageTaxonomy(
  membership: EditorialMembership | null,
): boolean {
  return membership?.role === "admin";
}

// Author identities and their account links are admin-only, like membership.
export function canManageAuthors(
  membership: EditorialMembership | null,
): boolean {
  return membership?.role === "admin";
}
