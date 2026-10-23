import "server-only";

import { createServerSupabaseClient } from "@/lib/supabase/server";

// Admin reads run with the caller's session. Categories and tags are public
// rows; post counts embed posts, which RLS shows in full only to editors and
// admins, so the counts include drafts for the admins who use these pages.

export type AdminCategory = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  parentId: string | null;
  sortOrder: number;
  updatedAt: string;
  postCount: number;
};

export type AdminTag = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  updatedAt: string;
  postCount: number;
};

type CountEmbed = { count: number }[] | null;

function embeddedCount(value: CountEmbed) {
  return value?.[0]?.count ?? 0;
}

export async function listAdminCategories(): Promise<AdminCategory[]> {
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase
    .from("categories")
    .select("id, name, slug, description, parent_id, sort_order, updated_at, posts(count)")
    .order("sort_order")
    .order("name");

  if (error) throw new Error(`Categories could not be loaded: ${error.message}`);

  return (data ?? []).map((row) => ({
    id: row.id,
    name: row.name,
    slug: row.slug,
    description: row.description,
    parentId: row.parent_id,
    sortOrder: row.sort_order,
    updatedAt: row.updated_at,
    postCount: embeddedCount(row.posts as CountEmbed),
  }));
}

export async function listAdminTags(): Promise<AdminTag[]> {
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase
    .from("tags")
    .select("id, name, slug, description, updated_at, post_tags(count)")
    .order("name");

  if (error) throw new Error(`Tags could not be loaded: ${error.message}`);

  return (data ?? []).map((row) => ({
    id: row.id,
    name: row.name,
    slug: row.slug,
    description: row.description,
    updatedAt: row.updated_at,
    postCount: embeddedCount(row.post_tags as CountEmbed),
  }));
}
