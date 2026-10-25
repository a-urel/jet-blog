import { normalizeName } from "@/lib/slug";

import { legalPageKinds, staticPagePath, type PageLink } from "./model";

// Header and footer menus (Phase 28). An item links a page by id (rendered
// with the page's current slug, so a slug change never breaks a menu) or an
// external https URL. save_navigation in
// supabase/migrations/20261026100000_pages_navigation.sql mirrors the rules
// below.

export const navigationLocations = ["header", "footer"] as const;

export type NavigationLocation = (typeof navigationLocations)[number];

export function isNavigationLocation(value: unknown): value is NavigationLocation {
  return typeof value === "string" && (navigationLocations as readonly string[]).includes(value);
}

export const maxNavigationItems = 50;
export const maxNavigationLabelLength = 80;
export const maxNavigationUrlLength = 2000;

// https only; no credentials, whitespace, quotes, angle brackets, or
// backslashes. Same pattern as navigation_items_url_safe.
const safeUrlPattern =
  /^https:\/\/[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?(?::[0-9]{1,5})?(?:[/?#][^\s"<>\\]*)?$/i;

export function isSafeNavigationUrl(value: string): boolean {
  return value.length <= maxNavigationUrlLength && safeUrlPattern.test(value);
}

export type NavigationLink = {
  key: string;
  label: string;
  href: string;
  external: boolean;
};

// A navigation_items row with its page embedded. The embed is null when the
// page is not visible to the reader (a draft, for the public).
export type RawNavigationItem = {
  id: string;
  label: string | null;
  url: string | null;
  page: { slug: string; title: string } | { slug: string; title: string }[] | null;
};

function embeddedPage(item: RawNavigationItem) {
  return Array.isArray(item.page) ? (item.page[0] ?? null) : item.page;
}

// Rows in display order to links. A page item whose page is hidden is
// dropped; a stored URL is re-checked so a row written outside the RPC cannot
// render an unsafe link.
export function resolveNavigationLinks(items: readonly RawNavigationItem[]): NavigationLink[] {
  return items.flatMap((item): NavigationLink[] => {
    if (item.url) {
      return item.label && isSafeNavigationUrl(item.url)
        ? [{ key: item.id, label: item.label, href: item.url, external: true }]
        : [];
    }

    const page = embeddedPage(item);
    return page
      ? [{ key: item.id, label: item.label ?? page.title, href: staticPagePath(page.slug), external: false }]
      : [];
  });
}

// The footer lists its configured items. While none are configured it lists
// the published legal pages instead, in legalPageKinds order, so a privacy
// notice is always reachable from every page.
export function footerNavigationLinks(
  configured: readonly NavigationLink[],
  legalPages: readonly PageLink[],
): NavigationLink[] {
  if (configured.length > 0) return [...configured];

  return legalPageKinds.flatMap((kind) => {
    const page = legalPages.find((candidate) => candidate.kind === kind);
    return page
      ? [{ key: `legal-${page.id}`, label: page.title, href: staticPagePath(page.slug), external: false }]
      : [];
  });
}

// Admin form input, one entry per row in display order.
export type NavigationItemInput =
  | { type: "page"; pageId: string; label: string }
  | { type: "url"; url: string; label: string };

export type NavigationItemError =
  | "pageMissing"
  | "urlMissing"
  | "urlInvalid"
  | "labelRequired"
  | "labelTooLong";

export type NavigationValidation =
  | {
      ok: true;
      items: ({ page_id: string; label?: string } | { url: string; label: string })[];
    }
  | { ok: false; tooMany: boolean; errors: Record<number, NavigationItemError> };

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Normalizes labels and URLs and returns the save_navigation payload, or the
// first problem of each invalid row.
export function validateNavigationItems(
  input: readonly NavigationItemInput[],
): NavigationValidation {
  if (input.length > maxNavigationItems) return { ok: false, tooMany: true, errors: {} };

  const errors: Record<number, NavigationItemError> = {};
  const items: ({ page_id: string; label?: string } | { url: string; label: string })[] = [];

  input.forEach((entry, index) => {
    const label = normalizeName(entry.label);

    if ([...label].length > maxNavigationLabelLength) {
      errors[index] = "labelTooLong";
      return;
    }

    if (entry.type === "page") {
      if (!uuidPattern.test(entry.pageId.trim())) {
        errors[index] = "pageMissing";
        return;
      }

      items.push(label ? { page_id: entry.pageId.trim(), label } : { page_id: entry.pageId.trim() });
      return;
    }

    const url = entry.url.trim();
    if (!url) {
      errors[index] = "urlMissing";
    } else if (!isSafeNavigationUrl(url)) {
      errors[index] = "urlInvalid";
    } else if (!label) {
      errors[index] = "labelRequired";
    } else {
      items.push({ url, label });
    }
  });

  return Object.keys(errors).length > 0
    ? { ok: false, tooMany: false, errors }
    : { ok: true, items };
}
