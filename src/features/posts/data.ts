import "server-only";

import { samplePosts } from "./sample-data";
import type { Post } from "./types";

// Replace this explicit sample source with public data queries in a later slice.
export function listPosts(): Post[] {
  return [...samplePosts].sort(
    (a, b) => Date.parse(b.publishedAt) - Date.parse(a.publishedAt),
  );
}

export function getPostBySlug(slug: string): Post | undefined {
  return samplePosts.find((post) => post.slug === slug);
}
