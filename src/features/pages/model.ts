import type { BodyDocument } from "@/features/posts/content/schema";

// Static pages (Phase 28): About, legal texts, contact, ... One version per
// page; the text is not translated per interface language. The database
// mirror is supabase/migrations/20261026100000_pages_navigation.sql.

export const pageKinds = ["privacy", "terms", "imprint", "cookies", "other"] as const;

export type PageKind = (typeof pageKinds)[number];

// Legal kinds in footer order. At most one published page per legal kind
// (pages_published_kind_key), so each one is "the" page of its kind.
export const legalPageKinds = ["privacy", "terms", "imprint", "cookies"] as const satisfies
  readonly PageKind[];

export function isPageKind(value: unknown): value is PageKind {
  return typeof value === "string" && (pageKinds as readonly string[]).includes(value);
}

export const maxPageTitleLength = 200;
export const maxPageSlugLength = 200;
export const maxPageMetaDescriptionLength = 300;

// Category-independent public URL, like /posts/[slug]. A prefix keeps page
// slugs from colliding with other top-level routes.
export function staticPagePath(slug: string): string {
  return `/pages/${slug}`;
}

export type PageStatus = "draft" | "published";

export type PublicPage = {
  id: string;
  title: string;
  slug: string;
  metaDescription: string | null;
  kind: PageKind;
  body: unknown;
  contentVersion: number;
  publishedAt: string;
  updatedAt: string;
};

// A published page as a link target (footer, sign-up and comment notices,
// sitemap).
export type PageLink = {
  id: string;
  title: string;
  slug: string;
  kind: PageKind;
  updatedAt: string;
};

export type AdminPageSummary = {
  id: string;
  title: string;
  slug: string;
  kind: PageKind;
  status: PageStatus;
  revision: number;
  updatedAt: string;
  publishedAt: string | null;
};

export type AdminPageDetail = AdminPageSummary & {
  metaDescription: string | null;
  body: unknown;
  contentVersion: number;
};

export type PageFormValues = {
  title: string;
  slug: string;
  metaDescription: string;
  kind: PageKind;
  body: BodyDocument;
};
