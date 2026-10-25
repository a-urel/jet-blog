import type { MetadataRoute } from "next";

import { archivePaths, postPath, type PublicArchives } from "@/features/posts/archives";
import type { PostSummary } from "@/features/posts/types";

// Builds sitemap entries from published content only: the inputs come from
// anonymous, RLS-filtered reads, so drafts, member previews, and redirected
// old slugs (which live in post_slug_redirects, not in posts.slug) never
// appear. Without a site origin there is no valid absolute URL to list, and
// with search-engine indexing turned off in the site settings the sitemap is
// empty like robots.txt is closed.
export function buildSitemap(input: {
  siteUrl: URL | null;
  indexing: boolean;
  posts: readonly PostSummary[];
  archives: PublicArchives;
}): MetadataRoute.Sitemap {
  const { siteUrl, posts, archives } = input;
  if (!siteUrl || !input.indexing) return [];

  const url = (path: string) => new URL(path, siteUrl).href;
  const newest = posts.reduce<string | undefined>(
    (current, post) =>
      !current || Date.parse(post.updatedAt) > Date.parse(current) ? post.updatedAt : current,
    undefined,
  );

  return [
    { url: url("/"), ...(newest ? { lastModified: newest } : {}) },
    ...posts.map((post) => ({ url: url(postPath(post.slug)), lastModified: post.updatedAt })),
    ...archives.categories.map((entry) => ({
      url: url(archivePaths.category(entry.slug)),
      lastModified: entry.lastModified,
    })),
    ...archives.tags.map((entry) => ({
      url: url(archivePaths.tag(entry.slug)),
      lastModified: entry.lastModified,
    })),
    ...archives.authors.map((entry) => ({
      url: url(archivePaths.author(entry.slug)),
      lastModified: entry.lastModified,
    })),
  ];
}

// Crawlers may read public pages only. Admin, sign-in, and invitation routes
// also send noindex; robots.txt keeps them from being crawled at all. Without
// a configured site origin (no canonical URLs possible), or with indexing
// turned off in the site settings, nothing is crawlable.
export function buildRobots(siteUrl: URL | null, indexing = true): MetadataRoute.Robots {
  if (!siteUrl || !indexing) return { rules: { userAgent: "*", disallow: "/" } };

  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/admin", "/login", "/auth"],
    },
    sitemap: new URL("/sitemap.xml", siteUrl).href,
  };
}
