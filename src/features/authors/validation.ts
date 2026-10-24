import { isUuid } from "@/features/posts/admin/validation";
import { isValidSlug, normalizeName, slugify } from "@/lib/slug";

// Mirrors the authors CHECK constraints (Phase 2 and author administration
// migrations).
export const authorLimits = {
  name: 120,
  slug: 120,
  bio: 2000,
} as const;

export type AuthorField = "name" | "slug" | "bio" | "profileId";

// Translated messages, as shown next to the form fields.
export type AuthorFieldErrors = Partial<Record<AuthorField, string>>;

// Validation stays framework-free: it returns message keys of the
// adminAuthors.validation catalog, which the Server Action translates.
export type AuthorIssueKey =
  | "nameRequired"
  | "nameTooLong"
  | "slugUnavailable"
  | "slugTooLong"
  | "slugInvalid"
  | "bioTooLong"
  | "profileInvalid";

export type AuthorIssue = Readonly<{
  key: AuthorIssueKey;
  values?: Readonly<Record<string, number>>;
}>;

export type AuthorFieldIssues = Partial<Record<AuthorField, AuthorIssue>>;

export type RawAuthorInput = Readonly<{
  name: string;
  slug: string;
  bio: string;
  profileId: string;
}>;

export type AuthorInput = Readonly<{
  name: string;
  slug: string;
  bio: string | null;
  // The linked editorial account, or null for a guest author.
  profileId: string | null;
}>;

export type AuthorValidation =
  | { ok: true; data: AuthorInput }
  | { ok: false; fieldErrors: AuthorFieldIssues };

export function validateAuthorInput(raw: RawAuthorInput): AuthorValidation {
  const fieldErrors: AuthorFieldIssues = {};

  const name = normalizeName(raw.name);
  if (name.length === 0) {
    fieldErrors.name = { key: "nameRequired" };
  } else if (name.length > authorLimits.name) {
    fieldErrors.name = { key: "nameTooLong", values: { max: authorLimits.name } };
  }

  // Same Turkish-aware generation as taxonomy: "Deniz Örnek" -> "deniz-ornek".
  const rawSlug = raw.slug.trim();
  const slug = rawSlug.length > 0 ? rawSlug : slugify(name, authorLimits.slug);

  if (slug.length === 0) {
    fieldErrors.slug = { key: "slugUnavailable" };
  } else if (slug.length > authorLimits.slug) {
    fieldErrors.slug = { key: "slugTooLong", values: { max: authorLimits.slug } };
  } else if (!isValidSlug(slug)) {
    fieldErrors.slug = { key: "slugInvalid" };
  }

  const bio = raw.bio.trim();
  if (bio.length > authorLimits.bio) {
    fieldErrors.bio = { key: "bioTooLong", values: { max: authorLimits.bio } };
  }

  const profileValue = raw.profileId.trim();
  let profileId: string | null = null;
  if (profileValue.length > 0) {
    if (isUuid(profileValue)) {
      profileId = profileValue;
    } else {
      fieldErrors.profileId = { key: "profileInvalid" };
    }
  }

  if (Object.keys(fieldErrors).length > 0) return { ok: false, fieldErrors };

  return {
    ok: true,
    data: { name, slug, bio: bio.length > 0 ? bio : null, profileId },
  };
}
