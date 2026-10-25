import "server-only";

import { createServerSupabaseClient } from "@/lib/supabase/server";
import { isPageKind, type AdminPageDetail, type AdminPageSummary, type PageStatus } from "../model";
import type { NavigationLocation } from "../navigation";

// Member reads for /admin/pages and /admin/navigation through the signed-in
// client: RLS returns drafts to editors and admins only. Never cached.

type RawAdminPage = {
  id: string;
  title: string;
  slug: string;
  kind: string;
  status: string;
  revision: number;
  updated_at: string;
  published_at: string | null;
  meta_description?: string | null;
  body?: unknown;
  content_version?: number;
};

const summaryColumns = "id, title, slug, kind, status, revision, updated_at, published_at";

function isPageStatus(value: string): value is PageStatus {
  return value === "draft" || value === "published";
}

function mapSummary(row: RawAdminPage): AdminPageSummary | null {
  if (!isPageKind(row.kind) || !isPageStatus(row.status)) return null;

  return {
    id: row.id,
    title: row.title,
    slug: row.slug,
    kind: row.kind,
    status: row.status,
    revision: row.revision,
    updatedAt: row.updated_at,
    publishedAt: row.published_at,
  };
}

export async function listAdminPages(): Promise<{ pages: AdminPageSummary[]; error: boolean }> {
  const { data, error } = await (await createServerSupabaseClient())
    .from("pages")
    .select(summaryColumns)
    .order("title");

  if (error) return { pages: [], error: true };

  return {
    pages: ((data ?? []) as RawAdminPage[]).flatMap((row) => {
      const page = mapSummary(row);
      return page ? [page] : [];
    }),
    error: false,
  };
}

export async function getAdminPage(
  id: string,
): Promise<{ page: AdminPageDetail | null; error: boolean }> {
  const { data, error } = await (await createServerSupabaseClient())
    .from("pages")
    .select(`${summaryColumns}, meta_description, body, content_version`)
    .eq("id", id)
    .maybeSingle();

  // An id that is not a UUID is a 404, not a load error.
  if (error?.code === "22P02") return { page: null, error: false };
  if (error) return { page: null, error: true };
  if (!data) return { page: null, error: false };

  const row = data as RawAdminPage;
  const summary = mapSummary(row);
  if (!summary) return { page: null, error: true };

  return {
    page: {
      ...summary,
      metaDescription: row.meta_description ?? null,
      body: row.body,
      contentVersion: row.content_version ?? 1,
    },
    error: false,
  };
}

export type AdminNavigationItem =
  | { type: "page"; pageId: string; label: string }
  | { type: "url"; url: string; label: string };

export type AdminNavigationMenu = {
  location: NavigationLocation;
  revision: number;
  items: AdminNavigationItem[];
};

type RawMenu = { location: NavigationLocation; revision: number };
type RawItem = {
  location: NavigationLocation;
  label: string | null;
  url: string | null;
  page_id: string | null;
};

export async function getAdminNavigation(): Promise<{
  menus: Record<NavigationLocation, AdminNavigationMenu> | null;
}> {
  const supabase = await createServerSupabaseClient();
  const [menus, items] = await Promise.all([
    supabase.from("navigation_menus").select("location, revision"),
    supabase
      .from("navigation_items")
      .select("location, label, url, page_id")
      .order("location")
      .order("sort_order"),
  ]);

  if (menus.error || items.error) return { menus: null };

  const result = {} as Record<NavigationLocation, AdminNavigationMenu>;
  for (const menu of (menus.data ?? []) as RawMenu[]) {
    result[menu.location] = { location: menu.location, revision: menu.revision, items: [] };
  }

  if (!result.header || !result.footer) return { menus: null };

  for (const item of (items.data ?? []) as RawItem[]) {
    const entry: AdminNavigationItem = item.page_id
      ? { type: "page", pageId: item.page_id, label: item.label ?? "" }
      : { type: "url", url: item.url ?? "", label: item.label ?? "" };
    result[item.location]?.items.push(entry);
  }

  return { menus: result };
}
