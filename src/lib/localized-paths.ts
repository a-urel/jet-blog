import { interfaceLocales } from "./interface-locales";

// Pages render under the internal [locale] segment (src/app/[locale]), so
// their cache entries are keyed by /<locale>/... while public URLs carry no
// locale. revalidatePath must name the internal route: these helpers map a
// public path to it, for every interface locale at once.

export const localeRouteSegment = "/[locale]";

// Route pattern (for revalidatePath(pattern, "page" | "layout")) covering
// every locale's copy: "/posts/[slug]" -> "/[locale]/posts/[slug]",
// "/" -> "/[locale]".
export function localizedRoutePattern(path: string): string {
  return path === "/" ? localeRouteSegment : `${localeRouteSegment}${path}`;
}

// Concrete paths of one public URL in every locale: "/posts/a" ->
// ["/tr/posts/a", "/en/posts/a", "/de/posts/a"].
export function localizedPaths(path: string): string[] {
  return interfaceLocales.map((locale) => (path === "/" ? `/${locale}` : `/${locale}${path}`));
}
