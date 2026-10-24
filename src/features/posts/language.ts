import { defaultInterfaceLocale } from "@/lib/interface-locales";

// The language a post is written in: a BCP 47 tag in canonical form,
// independent of the interface languages (src/lib/interface-locales.ts).
//
// Accepted grammar, a pragmatic subset of BCP 47 (RFC 5646):
//   language  2-3 lowercase letters                     tr, fil
//   script    optional, 4 letters, first uppercase      zh-Hant
//   region    optional, 2 uppercase letters or 3 digits pt-BR, es-419
// Variants, extensions, private use, and the special codes und, mis, mul,
// and zxx are rejected.
//
// The database checks the same grammar (public.is_post_language_tag in
// supabase/migrations/20261024220000_open_post_languages.sql). This side also
// applies CLDR aliases through Intl.getCanonicalLocales ("iw" becomes "he",
// "fra" becomes "fr"), so the application stores only canonical tags. The
// fixtures in ./language-fixtures.ts run against both sides.

declare const postLanguageBrand: unique symbol;

// A string checked by canonicalizePostLanguage or isPostLanguage.
export type PostLanguage = string & { readonly [postLanguageBrand]: true };

export const postLanguagePattern =
  /^[a-z]{2,3}(-[A-Z][a-z]{3})?(-([A-Z]{2}|[0-9]{3}))?$/;

export const maxPostLanguageLength = 12;

// Longer input is rejected before it reaches Intl. BCP 47 implementations
// must handle tags up to 35 characters; nothing accepted here is longer.
const maxPostLanguageInputLength = 35;

const specialLanguageSubtags = new Set(["und", "mis", "mul", "zxx"]);

export const defaultPostLanguage = "tr" as PostLanguage;

// Offered first in the administration picker; any other valid tag can be
// typed. Ordered by expected use, not alphabetically.
export const commonPostLanguages = [
  "tr",
  "en",
  "de",
  "fr",
  "es",
  "it",
  "pt",
  "pt-BR",
  "nl",
  "ru",
  "uk",
  "pl",
  "el",
  "bg",
  "ro",
  "hu",
  "cs",
  "sv",
  "da",
  "nb",
  "fi",
  "az",
  "ka",
  "hy",
  "ku",
  "ar",
  "fa",
  "he",
  "hi",
  "ja",
  "ko",
  "zh-Hans",
  "zh-Hant",
  "id",
] as PostLanguage[];

// Returns the canonical tag for valid input (case and CLDR aliases
// normalized, surrounding whitespace ignored), or null.
export function canonicalizePostLanguage(value: unknown): PostLanguage | null {
  if (typeof value !== "string") return null;

  const input = value.trim();
  if (input.length === 0 || input.length > maxPostLanguageInputLength) return null;

  let canonical: string;
  try {
    [canonical] = Intl.getCanonicalLocales(input);
  } catch {
    return null;
  }

  if (!canonical || !postLanguagePattern.test(canonical)) return null;
  if (specialLanguageSubtags.has(canonical.split("-")[0])) return null;

  return canonical as PostLanguage;
}

// True only for a tag that is already canonical, the form the database
// stores.
export function isPostLanguage(value: unknown): value is PostLanguage {
  return typeof value === "string" && canonicalizePostLanguage(value) === value;
}

const displayNamesCache = new Map<string, Intl.DisplayNames>();

function displayNames(locale: string): Intl.DisplayNames {
  let names = displayNamesCache.get(locale);
  if (!names) {
    names = new Intl.DisplayNames([locale], { type: "language", fallback: "none" });
    displayNamesCache.set(locale, names);
  }
  return names;
}

// The language's name in the interface language ("Fransızca" for fr,
// "Brezilya Portekizcesi" for pt-BR), or null when the runtime has no name
// for it.
export function postLanguageName(
  language: PostLanguage,
  interfaceLocale: string = defaultInterfaceLocale,
): string | null {
  try {
    return displayNames(interfaceLocale).of(language) ?? null;
  } catch {
    return null;
  }
}

// Name and code together, so an unnamed or unexpected tag stays readable:
// "Fransızca (fr)", or "xyz" alone.
export function postLanguageLabel(
  language: PostLanguage,
  interfaceLocale: string = defaultInterfaceLocale,
): string {
  const name = postLanguageName(language, interfaceLocale);
  return name ? `${name} (${language})` : language;
}

const openGraphTerritoryPattern = /^[A-Z]{2}$/;

// Open Graph expects language_TERRITORY. Likely subtags fill in a missing
// territory (fr → fr_FR, zh-Hant → zh_TW). A numeric region (es-419) is
// retried without it (es → es_ES). Returns null when no territory is known,
// so the caller can omit og:locale rather than guess.
export function openGraphLocale(language: PostLanguage): string | null {
  for (const candidate of [language, language.split("-")[0]]) {
    try {
      const maximized = new Intl.Locale(candidate).maximize();
      if (maximized.region && openGraphTerritoryPattern.test(maximized.region)) {
        return `${maximized.language}_${maximized.region}`;
      }
    } catch {
      return null;
    }
  }

  return null;
}
