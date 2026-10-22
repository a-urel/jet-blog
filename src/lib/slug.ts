// Shared slug and name normalization for taxonomy and posts. The database
// mirrors these rules with CHECK constraints and unique indexes, so a mutation
// must normalize before it writes.

const turkishCharacterMap: ReadonlyArray<readonly [RegExp, string]> = [
  [/[ıİI]/g, "i"],
  [/[şŞ]/g, "s"],
  [/[ğĞ]/g, "g"],
  [/[üÜ]/g, "u"],
  [/[öÖ]/g, "o"],
  [/[çÇ]/g, "c"],
];

export const maxSlugLength = 120;

// Trim and collapse internal whitespace so two names that only differ in
// spacing cannot create accidental duplicates.
export function normalizeName(value: string): string {
  return value.trim().replace(/\s+/g, " ");
}

export function isValidSlug(value: string): boolean {
  return /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value);
}

// Lower-case ASCII kebab-case. Turkish characters are transliterated rather
// than dropped so "Başlangıç" becomes "baslangic", not "bala".
export function slugify(value: string, maxLength = maxSlugLength): string {
  let slug = value;

  for (const [pattern, replacement] of turkishCharacterMap) {
    slug = slug.replace(pattern, replacement);
  }

  slug = slug
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  if (slug.length <= maxLength) return slug;

  return slug.slice(0, maxLength).replace(/-+$/g, "");
}
