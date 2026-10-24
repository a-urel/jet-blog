import {
  canonicalizePostLanguage,
  defaultPostLanguage,
  type PostLanguage,
} from "@/features/posts/language";
import { maxImageAltLength } from "@/features/posts/content/schema";
import { isValidSlug, normalizeName, slugify } from "@/lib/slug";

// Cover alt text follows the body image rules: at most 300 characters, no
// control characters. The database mirror is `public.assert_post_cover`.
export const maxCoverAltLength = maxImageAltLength;
const controlCharacterPattern = /[\u0000-\u001f\u007f]/;

export const invalidLanguageMessage =
  "Geçerli bir dil kodu seçin ya da yazın (ör. fr, pt-BR, zh-Hant).";

export type PostMetadataInput = Readonly<{
  title: string;
  slug: string;
  excerpt: string | null;
  categoryId: string | null;
  language: PostLanguage;
  coverMediaId: string | null;
  coverAlt: string | null;
  tagIds: string[];
  credits: ReadonlyArray<{ authorId: string; sortOrder: number }>;
}>;

export type PostFieldErrors = Partial<
  Record<
    | "title"
    | "slug"
    | "excerpt"
    | "categoryId"
    | "language"
    | "coverMediaId"
    | "coverAlt"
    | "tagIds"
    | "credits"
    | "body",
    string
  >
>;

export type RawPostMetadata = Readonly<{
  title: string;
  slug: string;
  excerpt: string;
  categoryId: string;
  language: string;
  coverMediaId: string;
  coverAlt: string;
  tagIds: string[];
  creditAuthorIds: string[];
  creditSortOrders: string[];
}>;

export type PostMetadataValidation =
  | { ok: true; data: PostMetadataInput }
  | { ok: false; fieldErrors: PostFieldErrors };

const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(value: string): boolean {
  return uuidPattern.test(value);
}

export function validatePostMetadata(
  raw: RawPostMetadata,
): PostMetadataValidation {
  const fieldErrors: PostFieldErrors = {};

  const title = normalizeName(raw.title);
  if (title.length === 0) {
    fieldErrors.title = "Başlık gerekli.";
  } else if (title.length > 200) {
    fieldErrors.title = "Başlık 200 karakteri aşamaz.";
  }

  const rawSlug = raw.slug.trim();
  const slug = rawSlug.length > 0 ? rawSlug : slugify(title, 200);

  if (slug.length === 0) {
    fieldErrors.slug = "Slug üretilemedi; elle girin.";
  } else if (slug.length > 200) {
    fieldErrors.slug = "Slug 200 karakteri aşamaz.";
  } else if (!isValidSlug(slug)) {
    fieldErrors.slug =
      "Slug yalnızca küçük harf, rakam ve tek tire içerebilir.";
  }

  const excerpt = raw.excerpt.trim();
  if (excerpt.length > 500) {
    fieldErrors.excerpt = "Özet 500 karakteri aşamaz.";
  }

  const categoryValue = raw.categoryId.trim();
  let categoryId: string | null = null;

  if (categoryValue.length > 0) {
    if (!isUuid(categoryValue)) {
      fieldErrors.categoryId = "Geçerli bir kategori seçin.";
    } else {
      categoryId = categoryValue;
    }
  }

  // Any well-formed tag, stored in canonical form (pt-br becomes pt-BR).
  const canonicalLanguage = canonicalizePostLanguage(raw.language);
  let language: PostLanguage = defaultPostLanguage;

  if (canonicalLanguage) {
    language = canonicalLanguage;
  } else {
    fieldErrors.language = invalidLanguageMessage;
  }

  // Drafts may keep a cover without alt text; publishing requires it, which
  // the database enforces because only it knows the post's current status.
  const coverValue = raw.coverMediaId.trim();
  const coverAltValue = raw.coverAlt.trim();
  let coverMediaId: string | null = null;

  if (coverValue.length > 0) {
    if (!isUuid(coverValue)) {
      fieldErrors.coverMediaId = "Geçerli bir kapak görseli seçin.";
    } else {
      coverMediaId = coverValue.toLowerCase();
    }
  }

  if (
    [...coverAltValue].length > maxCoverAltLength ||
    controlCharacterPattern.test(coverAltValue)
  ) {
    fieldErrors.coverAlt = `Kapak alternatif metni en fazla ${maxCoverAltLength} karakter olabilir.`;
  }

  const tagIds: string[] = [];
  const seenTags = new Set<string>();

  for (const tagValue of raw.tagIds) {
    const tagId = tagValue.trim();
    if (tagId.length === 0) continue;

    if (!isUuid(tagId)) {
      fieldErrors.tagIds = "Geçersiz etiket seçimi.";
      continue;
    }

    if (seenTags.has(tagId)) {
      fieldErrors.tagIds = "Aynı etiket birden fazla kez eklenemez.";
      continue;
    }

    seenTags.add(tagId);
    tagIds.push(tagId);
  }

  if (
    raw.creditAuthorIds.length !== raw.creditSortOrders.length
  ) {
    fieldErrors.credits = "Yazar sırası bilgisi eksik.";
  }

  const credits: { authorId: string; sortOrder: number }[] = [];
  const seenAuthors = new Set<string>();
  const seenSortOrders = new Set<number>();
  const creditCount = Math.min(
    raw.creditAuthorIds.length,
    raw.creditSortOrders.length,
  );

  for (let index = 0; index < creditCount; index += 1) {
    const authorId = raw.creditAuthorIds[index]?.trim() ?? "";
    const sortOrderValue = raw.creditSortOrders[index]?.trim() ?? "";

    if (authorId.length === 0) {
      fieldErrors.credits = "Her sıra için bir yazar seçin.";
      break;
    }

    if (!isUuid(authorId)) {
      fieldErrors.credits = "Geçersiz yazar seçimi.";
      break;
    }

    if (!/^[0-9]+$/.test(sortOrderValue)) {
      fieldErrors.credits = "Yazar sırası geçersiz.";
      break;
    }

    const sortOrder = Number.parseInt(sortOrderValue, 10);

    if (
      !Number.isSafeInteger(sortOrder) ||
      sortOrder < 0 ||
      sortOrder > 999
    ) {
      fieldErrors.credits = "Yazar sırası 0 ile 999 arasında olmalı.";
      break;
    }

    if (seenAuthors.has(authorId)) {
      fieldErrors.credits = "Aynı yazar birden fazla kez eklenemez.";
      break;
    }

    if (seenSortOrders.has(sortOrder)) {
      fieldErrors.credits = "Yazar sıraları benzersiz olmalı.";
      break;
    }

    seenAuthors.add(authorId);
    seenSortOrders.add(sortOrder);
    credits.push({ authorId, sortOrder });
  }

  if (!fieldErrors.credits && credits.length > 0) {
    const contiguous = credits.every(
      (credit, index) => credit.sortOrder === index,
    );

    if (!contiguous) {
      fieldErrors.credits =
        "Yazar sıraları 0'dan başlayıp kesintisiz olmalı.";
    }
  }

  if (Object.keys(fieldErrors).length > 0) {
    return { ok: false, fieldErrors };
  }

  credits.sort((left, right) => left.sortOrder - right.sortOrder);

  return {
    ok: true,
    data: {
      title,
      slug,
      excerpt: excerpt.length > 0 ? excerpt : null,
      categoryId,
      language,
      coverMediaId,
      // Alt text without a cover is dropped rather than rejected: removing the
      // cover in the form leaves nothing for it to describe.
      coverAlt: coverMediaId && coverAltValue.length > 0 ? coverAltValue : null,
      tagIds,
      credits,
    },
  };
}

export function getCreditFieldValues(formData: FormData) {
  return {
    creditAuthorIds: formData
      .getAll("creditAuthorId")
      .filter((value): value is string => typeof value === "string"),
    creditSortOrders: formData
      .getAll("creditSortOrder")
      .filter((value): value is string => typeof value === "string"),
  };
}

export function getTagFieldValues(formData: FormData) {
  return formData
    .getAll("tagId")
    .filter((value): value is string => typeof value === "string");
}

export function getStringField(formData: FormData, name: string) {
  const value = formData.get(name);
  return typeof value === "string" ? value : "";
}
