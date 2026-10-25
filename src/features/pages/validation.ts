import { isValidSlug, normalizeName, slugify } from "@/lib/slug";

import {
  isPageKind,
  maxPageMetaDescriptionLength,
  maxPageSlugLength,
  maxPageTitleLength,
  type PageKind,
} from "./model";

// Page fields outside the body. The database mirror is
// public.normalize_page_fields; the body uses the post body allowlist
// (parseSubmittedBody / assert_post_body). Message keys live under
// adminPages.validation.

export type PageValidationError =
  | "titleRequired"
  | "titleTooLong"
  | "slugMissing"
  | "slugTooLong"
  | "slugInvalid"
  | "metaDescriptionTooLong"
  | "kindInvalid";

export type PageField = "title" | "slug" | "metaDescription" | "kind" | "body";

export type PageFieldErrors = Partial<Record<PageField, PageValidationError>>;

export type PageFieldsInput = {
  title: string;
  slug: string;
  metaDescription: string | null;
  kind: PageKind;
};

export type PageFieldsValidation =
  | { ok: true; data: PageFieldsInput }
  | { ok: false; fieldErrors: PageFieldErrors };

export function validatePageFields(raw: {
  title: string;
  slug: string;
  metaDescription: string;
  kind: string;
}): PageFieldsValidation {
  const fieldErrors: PageFieldErrors = {};

  const title = normalizeName(raw.title);
  if (title.length === 0) fieldErrors.title = "titleRequired";
  else if ([...title].length > maxPageTitleLength) fieldErrors.title = "titleTooLong";

  // An empty slug is derived from the title, like posts.
  const rawSlug = raw.slug.trim().toLowerCase();
  const slug = rawSlug.length > 0 ? rawSlug : slugify(title, maxPageSlugLength);
  if (slug.length === 0) fieldErrors.slug = "slugMissing";
  else if (slug.length > maxPageSlugLength) fieldErrors.slug = "slugTooLong";
  else if (!isValidSlug(slug)) fieldErrors.slug = "slugInvalid";

  const metaDescription = raw.metaDescription.trim();
  if ([...metaDescription].length > maxPageMetaDescriptionLength) {
    fieldErrors.metaDescription = "metaDescriptionTooLong";
  }

  const kind = raw.kind.trim() || "other";
  if (!isPageKind(kind)) fieldErrors.kind = "kindInvalid";

  if (Object.keys(fieldErrors).length > 0) return { ok: false, fieldErrors };

  return {
    ok: true,
    data: {
      title,
      slug,
      metaDescription: metaDescription || null,
      kind: kind as PageKind,
    },
  };
}
