// Languages of the interface (navigation, forms, messages), not of posts.
// A post may be written in any language (src/features/posts/language.ts);
// the interface supports this small, fixed set.
//
// The interface locale never appears in a public URL. src/proxy.ts resolves it
// from the locale cookie (set by the language switcher), then Accept-Language,
// then the default, and rewrites the request to the internal [locale] segment
// (src/app/[locale]), so every locale gets its own prerendered copy of each
// public page.

export const interfaceLocales = ["tr", "en", "de"] as const;

export type InterfaceLocale = (typeof interfaceLocales)[number];

export const defaultInterfaceLocale: InterfaceLocale = "tr";

// Strictly functional preference cookie: it only selects the interface
// language, carries no identifier, and is never read for tracking, so it
// needs no consent banner (ePrivacy "strictly necessary" exemption).
export const localeCookieName = "locale";
export const localeCookieMaxAge = 60 * 60 * 24 * 365;

// Set by src/proxy.ts on the rewritten request. Server Actions and Route
// Handlers cannot read the [locale] root parameter, so they read this header.
export const localeRequestHeader = "x-interface-locale";

// Endonyms: each language is named in itself, so a reader who does not
// understand the current interface still finds their own language.
export const interfaceLocaleNames: Record<InterfaceLocale, string> = {
  tr: "Türkçe",
  en: "English",
  de: "Deutsch",
};

// Open Graph og:locale for pages whose language is the interface language
// (listings, archives, search). Post pages use the post's own language.
export const interfaceOpenGraphLocales: Record<InterfaceLocale, string> = {
  tr: "tr_TR",
  en: "en_US",
  de: "de_DE",
};

export function isInterfaceLocale(value: unknown): value is InterfaceLocale {
  return (
    typeof value === "string" &&
    (interfaceLocales as readonly string[]).includes(value)
  );
}

// The supported locale for one language range ("de-AT" -> "de"), or null.
function matchLanguageRange(range: string): InterfaceLocale | null {
  const primary = range.toLowerCase().split("-")[0];
  return isInterfaceLocale(primary) ? primary : null;
}

// Accept-Language negotiation (RFC 9110 §12.5.4): ranges by descending
// quality, ties in header order; q=0 means "not acceptable"; "*" and
// malformed entries are skipped. Only the primary subtag is compared, because
// the interface locales carry no region. Returns null when nothing matches.
export function negotiateInterfaceLocale(header: string | null | undefined): InterfaceLocale | null {
  if (!header) return null;

  const ranges = header
    .slice(0, 1024)
    .split(",")
    .map((entry, index) => {
      const [tag, ...parameters] = entry.trim().split(";");
      let quality = 1;
      for (const parameter of parameters) {
        const [key, value] = parameter.trim().split("=");
        if (key?.trim().toLowerCase() === "q") {
          const parsed = Number(value);
          quality = Number.isFinite(parsed) && parsed >= 0 && parsed <= 1 ? parsed : 0;
        }
      }
      return { tag: tag?.trim() ?? "", quality, index };
    })
    .filter(({ tag, quality }) => quality > 0 && /^[A-Za-z]{1,8}(-[A-Za-z0-9]{1,8})*$/.test(tag))
    .sort((left, right) => right.quality - left.quality || left.index - right.index);

  for (const { tag } of ranges) {
    const match = matchLanguageRange(tag);
    if (match) return match;
  }

  return null;
}

// The interface locale of a request: a valid cookie wins, then
// Accept-Language, then the default. Unknown cookie values fall back silently.
export function resolveInterfaceLocale(
  cookieValue: string | null | undefined,
  acceptLanguage: string | null | undefined,
): InterfaceLocale {
  if (isInterfaceLocale(cookieValue)) return cookieValue;
  return negotiateInterfaceLocale(acceptLanguage) ?? defaultInterfaceLocale;
}
