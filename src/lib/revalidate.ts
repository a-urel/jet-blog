import "server-only";

import { revalidatePath } from "next/cache";

import { localizedPaths, localizedRoutePattern } from "./localized-paths";

// revalidatePath for a page under src/app/[locale], written with its public
// path. With a type, the path is a route pattern and one call covers every
// locale; without one, each locale's concrete path is revalidated.
export function revalidateLocalizedPath(path: string, type?: "page" | "layout") {
  if (type) {
    revalidatePath(localizedRoutePattern(path), type);
    return;
  }

  localizedPaths(path).forEach((localizedPath) => revalidatePath(localizedPath));
}
