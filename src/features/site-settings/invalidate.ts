import "server-only";

import { revalidatePath, updateTag } from "next/cache";

import { siteSettingsInvalidation } from "./cache";

// See ./cache.ts. updateTag only works in Server Actions.
export function invalidateSiteSettings() {
  const { tags, routes } = siteSettingsInvalidation();
  tags.forEach((tag) => updateTag(tag));
  routes.forEach(({ path, type }) => revalidatePath(path, type));
}
