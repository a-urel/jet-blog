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

export type AuthorFieldErrors = Partial<Record<AuthorField, string>>;

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
  | { ok: false; fieldErrors: AuthorFieldErrors };

export function validateAuthorInput(raw: RawAuthorInput): AuthorValidation {
  const fieldErrors: AuthorFieldErrors = {};

  const name = normalizeName(raw.name);
  if (name.length === 0) {
    fieldErrors.name = "Ad gerekli.";
  } else if (name.length > authorLimits.name) {
    fieldErrors.name = `Ad ${authorLimits.name} karakteri aşamaz.`;
  }

  // Same Turkish-aware generation as taxonomy: "Deniz Örnek" -> "deniz-ornek".
  const rawSlug = raw.slug.trim();
  const slug = rawSlug.length > 0 ? rawSlug : slugify(name, authorLimits.slug);

  if (slug.length === 0) {
    fieldErrors.slug = "Slug üretilemedi; elle girin.";
  } else if (slug.length > authorLimits.slug) {
    fieldErrors.slug = `Slug ${authorLimits.slug} karakteri aşamaz.`;
  } else if (!isValidSlug(slug)) {
    fieldErrors.slug = "Slug yalnızca küçük harf, rakam ve tek tire içerebilir.";
  }

  const bio = raw.bio.trim();
  if (bio.length > authorLimits.bio) {
    fieldErrors.bio = `Biyografi ${authorLimits.bio} karakteri aşamaz.`;
  }

  const profileValue = raw.profileId.trim();
  let profileId: string | null = null;
  if (profileValue.length > 0) {
    if (isUuid(profileValue)) {
      profileId = profileValue;
    } else {
      fieldErrors.profileId = "Geçerli bir hesap seçin.";
    }
  }

  if (Object.keys(fieldErrors).length > 0) return { ok: false, fieldErrors };

  return {
    ok: true,
    data: { name, slug, bio: bio.length > 0 ? bio : null, profileId },
  };
}
