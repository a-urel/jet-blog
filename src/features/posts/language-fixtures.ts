// Shared post language fixtures. Unit tests run them through
// canonicalizePostLanguage and isPostLanguage; the RLS suite sends them to
// public.is_post_language_tag and the authoring RPCs. A fixture that passes in
// one place and fails in the other means the grammars have drifted.

// Canonical tags: accepted unchanged on both sides.
export const canonicalLanguageFixtures: readonly string[] = [
  "tr",
  "en",
  "de",
  "fr",
  "ja",
  "fil",
  "pt-BR",
  "zh-Hant",
  "zh-Hant-TW",
  "sr-Latn",
  "es-419",
  "qaa",
  "xyz",
];

// Valid but not canonical input. The application stores the canonical form;
// the database rejects the input as written when its casing is not canonical.
export const canonicalizedLanguageFixtures: ReadonlyArray<{
  input: string;
  canonical: string;
  databaseAcceptsInput: boolean;
}> = [
  { input: "pt-br", canonical: "pt-BR", databaseAcceptsInput: false },
  { input: "ZH-hant-tw", canonical: "zh-Hant-TW", databaseAcceptsInput: false },
  { input: "EN", canonical: "en", databaseAcceptsInput: false },
  { input: " fr ", canonical: "fr", databaseAcceptsInput: false },
  { input: "tr\n", canonical: "tr", databaseAcceptsInput: false },
  // CLDR aliases are well-formed, so only the application rewrites them.
  { input: "iw", canonical: "he", databaseAcceptsInput: true },
  { input: "fra", canonical: "fr", databaseAcceptsInput: true },
  { input: "sh", canonical: "sr-Latn", databaseAcceptsInput: true },
];

// Rejected on both sides.
export const invalidLanguageFixtures: readonly string[] = [
  "",
  " ",
  "en_US",
  "xx-",
  "-en",
  "e",
  "english",
  "en-",
  "en--US",
  "en-us-",
  "en-Latnn",
  "en-U",
  "en-USA",
  "es-41",
  "de-DE-1996",
  "en-GB-oed",
  "en-US-u-ca-gregory",
  "en-x-private",
  "x-private",
  "i-klingon",
  "und",
  "mul",
  "zxx",
  "mis",
  "t\nr",
  "tr;",
  "tr' or '1'='1",
  "'); drop table public.posts; --",
  "<script>alert(1)</script>",
  "tr\u0000",
  "ır",
  "en-ÜS",
  "a".repeat(13),
  `en-${"a".repeat(40)}`,
];
