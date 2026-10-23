import "server-only";

import { isEditorialRole, type EditorialRole } from "@/lib/auth/editorial";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { isSupabaseAdminConfigured } from "@/lib/supabase/env";
import { createServerSupabaseClient } from "@/lib/supabase/server";

// Admin reads run with the caller's session. The authors_select_admin policy
// shows every author, and post_authors counts include drafts for admins.
// authors.user_id is not column-readable, so links come from the admin-only
// list_author_account_links RPC.

export type AdminAuthor = {
  id: string;
  name: string;
  slug: string;
  bio: string | null;
  updatedAt: string;
  creditCount: number;
  profileId: string | null;
};

export type AuthorAccountOption = {
  profileId: string;
  label: string;
  role: EditorialRole;
  deactivated: boolean;
};

type CountEmbed = { count: number }[] | null;

export async function listAdminAuthors(): Promise<AdminAuthor[]> {
  const supabase = await createServerSupabaseClient();
  const [authors, links] = await Promise.all([
    supabase
      .from("authors")
      .select("id, name, slug, bio, updated_at, post_authors(count)")
      .order("name"),
    supabase.rpc("list_author_account_links"),
  ]);

  if (authors.error) throw new Error(`Authors could not be loaded: ${authors.error.message}`);
  if (links.error) throw new Error(`Author links could not be loaded: ${links.error.message}`);

  const profileByAuthor = new Map(
    ((links.data ?? []) as { author_id: string; profile_id: string }[]).map((row) => [
      row.author_id,
      row.profile_id,
    ]),
  );

  return (authors.data ?? []).map((row) => ({
    id: row.id,
    name: row.name,
    slug: row.slug,
    bio: row.bio,
    updatedAt: row.updated_at,
    creditCount: (row.post_authors as CountEmbed)?.[0]?.count ?? 0,
    profileId: profileByAuthor.get(row.id) ?? null,
  }));
}

// Every editorial member, labelled by display name and email. Deactivated
// members are included so an existing link still has a label; the form only
// offers them for the author they are already linked to.
export async function listAuthorAccountOptions(): Promise<AuthorAccountOption[]> {
  const supabase = await createServerSupabaseClient();
  const { data: members, error } = await supabase
    .from("editorial_members")
    .select("profile_id, role, deactivated_at")
    .order("created_at", { ascending: true });

  if (error) throw new Error(`Members could not be loaded: ${error.message}`);

  const rows = (members ?? []).filter((row) => isEditorialRole(row.role));
  const profileIds = rows.map((row) => row.profile_id as string);
  const displayNames = new Map<string, string | null>();
  const emails = new Map<string, string | null>();

  if (profileIds.length > 0) {
    const { data: profiles } = await supabase
      .from("profiles")
      .select("id, display_name")
      .in("id", profileIds);
    profiles?.forEach((profile) => displayNames.set(profile.id, profile.display_name));
  }

  if (isSupabaseAdminConfigured()) {
    try {
      const { data } = await createAdminSupabaseClient().auth.admin.listUsers({
        page: 1,
        perPage: 1000,
      });
      data?.users.forEach((user) => emails.set(user.id, user.email ?? null));
    } catch {
      // Labels fall back to display names or ids.
    }
  }

  return rows.map((row) => {
    const profileId = row.profile_id as string;
    const displayName = displayNames.get(profileId);
    const email = emails.get(profileId);
    const label =
      displayName && email ? `${displayName} (${email})` : (displayName ?? email ?? profileId);

    return {
      profileId,
      label,
      role: row.role as EditorialRole,
      deactivated: typeof row.deactivated_at === "string",
    };
  });
}
