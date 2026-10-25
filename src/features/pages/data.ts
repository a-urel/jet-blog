import "server-only";

import { cache } from "react";

import { isSupabaseConfigured } from "@/lib/supabase/env";
import { createPublicServerSupabaseClient } from "@/lib/supabase/server";
import { publicPagesCacheTag } from "./cache";
import { isPageKind, type PageKind, type PageLink, type PublicPage } from "./model";
import {
  footerNavigationLinks,
  resolveNavigationLinks,
  type NavigationLink,
  type RawNavigationItem,
} from "./navigation";

// Public reads of pages and menus: anonymous client only, so RLS returns
// published pages and the menu items that link them (or external URLs), and
// the calling routes stay prerenderable. Cache model: ./cache.ts.
//
// Errors throw instead of returning empty results, so a transient failure is
// not cached as a 404, except for the layout's menus (getSiteNavigation),
// which fall back to empty menus: a navigation outage must not take down
// every page.

function publicClient() {
  return createPublicServerSupabaseClient({ cacheTags: [publicPagesCacheTag] });
}

const publicPageColumns =
  "id, title, slug, meta_description, kind, body, content_version, published_at, updated_at";
const pageLinkColumns = "id, title, slug, kind, updated_at";

type RawPage = {
  id: string;
  title: string;
  slug: string;
  meta_description: string | null;
  kind: string;
  body: unknown;
  content_version: number;
  published_at: string | null;
  updated_at: string;
};

type RawPageLink = Pick<RawPage, "id" | "title" | "slug" | "kind" | "updated_at">;

function mapPage(row: RawPage): PublicPage | null {
  if (!isPageKind(row.kind) || !row.published_at) return null;

  return {
    id: row.id,
    title: row.title,
    slug: row.slug,
    metaDescription: row.meta_description,
    kind: row.kind,
    body: row.body,
    contentVersion: row.content_version,
    publishedAt: row.published_at,
    updatedAt: row.updated_at,
  };
}

function mapPageLink(row: RawPageLink): PageLink | null {
  return isPageKind(row.kind)
    ? { id: row.id, title: row.title, slug: row.slug, kind: row.kind, updatedAt: row.updated_at }
    : null;
}

export type PageLookup =
  | { kind: "page"; page: PublicPage }
  | { kind: "redirect"; slug: string }
  | { kind: "missing" };

// Deduplicated per render so generateMetadata and the page share one query.
export const findPublishedPage = cache(async (slug: string): Promise<PageLookup> => {
  if (!isSupabaseConfigured()) return { kind: "missing" };

  const supabase = publicClient();
  const { data, error } = await supabase
    .from("pages")
    .select(publicPageColumns)
    .eq("slug", slug)
    .eq("status", "published")
    .maybeSingle();

  if (error) throw new Error(`Page could not be loaded: ${error.message}`);

  if (data) {
    const page = mapPage(data as RawPage);
    return page ? { kind: "page", page } : { kind: "missing" };
  }

  // An old slug of a published page resolves to its current slug in one hop.
  // RLS hides redirects of unpublished pages, and the inner embed repeats it.
  const redirect = await supabase
    .from("page_slug_redirects")
    .select("page:pages!inner(slug, status)")
    .eq("old_slug", slug)
    .eq("page.status", "published")
    .maybeSingle();

  if (redirect.error) {
    throw new Error(`Page redirect could not be loaded: ${redirect.error.message}`);
  }

  const target = redirect.data?.page as { slug: string } | { slug: string }[] | null | undefined;
  const targetSlug = Array.isArray(target) ? target[0]?.slug : target?.slug;

  return targetSlug && targetSlug !== slug
    ? { kind: "redirect", slug: targetSlug }
    : { kind: "missing" };
});

// Every published page: generateStaticParams, the sitemap, and legal links.
export const listPublishedPages = cache(async (): Promise<PageLink[]> => {
  if (!isSupabaseConfigured()) return [];

  const { data, error } = await publicClient()
    .from("pages")
    .select(pageLinkColumns)
    .eq("status", "published")
    .order("title");

  if (error) throw new Error(`Published pages could not be loaded: ${error.message}`);

  return ((data ?? []) as RawPageLink[]).flatMap((row) => {
    const link = mapPageLink(row);
    return link ? [link] : [];
  });
});

// The published page of a legal kind, if any (at most one exists).
export async function findLegalPage(kind: Exclude<PageKind, "other">): Promise<PageLink | null> {
  return (await listPublishedPages()).find((page) => page.kind === kind) ?? null;
}

export type SiteNavigation = {
  header: NavigationLink[];
  footer: NavigationLink[];
};

const emptyNavigation: SiteNavigation = { header: [], footer: [] };

// Header and footer links for the root layout.
export const getSiteNavigation = cache(async (): Promise<SiteNavigation> => {
  if (!isSupabaseConfigured()) return emptyNavigation;

  try {
    const [items, pages] = await Promise.all([
      publicClient()
        .from("navigation_items")
        .select("id, location, label, url, page:pages(slug, title)")
        .order("location")
        .order("sort_order"),
      listPublishedPages(),
    ]);

    if (items.error) throw new Error(items.error.message);

    const rows = (items.data ?? []) as (RawNavigationItem & { location: string })[];
    const header = resolveNavigationLinks(rows.filter((row) => row.location === "header"));
    const footer = resolveNavigationLinks(rows.filter((row) => row.location === "footer"));

    return { header, footer: footerNavigationLinks(footer, pages) };
  } catch (error) {
    console.error("Site navigation could not be loaded", error);
    return emptyNavigation;
  }
});
