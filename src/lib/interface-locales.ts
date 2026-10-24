// Languages of the interface (navigation, forms, messages), not of posts.
// A post may be written in any language (src/features/posts/language.ts);
// the interface supports this small, fixed set. Phase 22 will let readers
// choose among them; until then every page uses the default.

export const interfaceLocales = ["tr", "en", "de"] as const;

export type InterfaceLocale = (typeof interfaceLocales)[number];

export const defaultInterfaceLocale: InterfaceLocale = "tr";

export function isInterfaceLocale(value: unknown): value is InterfaceLocale {
  return (
    typeof value === "string" &&
    (interfaceLocales as readonly string[]).includes(value)
  );
}
