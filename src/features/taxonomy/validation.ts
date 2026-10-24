import { isUuid } from "@/features/posts/admin/validation";
import { isValidSlug, normalizeName, slugify } from "@/lib/slug";

// Mirrors the categories/tags CHECK constraints in the Phase 3 migration.
export const taxonomyLimits = {
  category: { name: 120, slug: 120 },
  tag: { name: 80, slug: 80 },
  description: 1000,
  sortOrder: { min: 0, max: 1000 },
} as const;

export type TaxonomyField = "name" | "slug" | "description" | "parentId" | "sortOrder";

// Translated messages, as shown next to the form fields.
export type TaxonomyFieldErrors = Partial<Record<TaxonomyField, string>>;

// Validation stays framework-free: it returns message keys of the
// adminTaxonomy.validation catalog, which the Server Action translates.
export type TaxonomyIssueKey =
  | "nameRequired"
  | "nameTooLong"
  | "slugUnavailable"
  | "slugTooLong"
  | "slugInvalid"
  | "descriptionTooLong"
  | "parentInvalid"
  | "sortOrderInvalid";

export type TaxonomyIssue = Readonly<{
  key: TaxonomyIssueKey;
  values?: Readonly<Record<string, number>>;
}>;

export type TaxonomyFieldIssues = Partial<Record<TaxonomyField, TaxonomyIssue>>;

export type RawTaxonomyInput = Readonly<{
  name: string;
  slug: string;
  description: string;
  parentId?: string;
  sortOrder?: string;
}>;

export type CategoryInput = Readonly<{
  name: string;
  slug: string;
  description: string | null;
  parentId: string | null;
  sortOrder: number;
}>;

export type TagInput = Readonly<{
  name: string;
  slug: string;
  description: string | null;
}>;

export type TaxonomyValidation<T> =
  | { ok: true; data: T }
  | { ok: false; fieldErrors: TaxonomyFieldIssues };

function validateShared(
  raw: RawTaxonomyInput,
  limits: { name: number; slug: number },
  fieldErrors: TaxonomyFieldIssues,
) {
  const name = normalizeName(raw.name);
  if (name.length === 0) {
    fieldErrors.name = { key: "nameRequired" };
  } else if (name.length > limits.name) {
    fieldErrors.name = { key: "nameTooLong", values: { max: limits.name } };
  }

  // An empty slug is generated from the name with the shared Turkish-aware
  // transliteration, so "Başlangıç" becomes "baslangic".
  const rawSlug = raw.slug.trim();
  const slug = rawSlug.length > 0 ? rawSlug : slugify(name, limits.slug);

  if (slug.length === 0) {
    fieldErrors.slug = { key: "slugUnavailable" };
  } else if (slug.length > limits.slug) {
    fieldErrors.slug = { key: "slugTooLong", values: { max: limits.slug } };
  } else if (!isValidSlug(slug)) {
    fieldErrors.slug = { key: "slugInvalid" };
  }

  const description = raw.description.trim();
  if (description.length > taxonomyLimits.description) {
    fieldErrors.description = {
      key: "descriptionTooLong",
      values: { max: taxonomyLimits.description },
    };
  }

  return { name, slug, description: description.length > 0 ? description : null };
}

export function validateCategoryInput(
  raw: RawTaxonomyInput,
): TaxonomyValidation<CategoryInput> {
  const fieldErrors: TaxonomyFieldIssues = {};
  const shared = validateShared(raw, taxonomyLimits.category, fieldErrors);

  const parentValue = raw.parentId?.trim() ?? "";
  let parentId: string | null = null;
  if (parentValue.length > 0) {
    if (isUuid(parentValue)) {
      parentId = parentValue;
    } else {
      fieldErrors.parentId = { key: "parentInvalid" };
    }
  }

  const sortValue = raw.sortOrder?.trim() ?? "";
  const sortOrder = sortValue.length > 0 ? Number(sortValue) : 0;
  if (
    !Number.isInteger(sortOrder) ||
    sortOrder < taxonomyLimits.sortOrder.min ||
    sortOrder > taxonomyLimits.sortOrder.max
  ) {
    fieldErrors.sortOrder = { key: "sortOrderInvalid", values: taxonomyLimits.sortOrder };
  }

  if (Object.keys(fieldErrors).length > 0) return { ok: false, fieldErrors };

  return { ok: true, data: { ...shared, parentId, sortOrder } };
}

export function validateTagInput(raw: RawTaxonomyInput): TaxonomyValidation<TagInput> {
  const fieldErrors: TaxonomyFieldIssues = {};
  const shared = validateShared(raw, taxonomyLimits.tag, fieldErrors);

  if (Object.keys(fieldErrors).length > 0) return { ok: false, fieldErrors };

  return { ok: true, data: shared };
}
