// Languages a post can be written in. The database CHECK constraint and
// assert_post_language (supabase/migrations/20261024120000_post_language.sql)
// allow the same set; change all three together.

export const postLanguages = ["tr", "en", "de"] as const;

export type PostLanguage = (typeof postLanguages)[number];

export const defaultPostLanguage: PostLanguage = "tr";

// Option labels for the Turkish administration interface.
export const postLanguageLabels: Record<PostLanguage, string> = {
  tr: "Türkçe",
  en: "İngilizce",
  de: "Almanca",
};

// Open Graph expects language_TERRITORY. The publication has no regional
// variants, so each language uses its most common territory.
const openGraphLocales: Record<PostLanguage, string> = {
  tr: "tr_TR",
  en: "en_US",
  de: "de_DE",
};

export function isPostLanguage(value: unknown): value is PostLanguage {
  return (
    typeof value === "string" &&
    (postLanguages as readonly string[]).includes(value)
  );
}

export function openGraphLocale(language: PostLanguage): string {
  return openGraphLocales[language];
}
