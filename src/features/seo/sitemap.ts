import type { MetadataRoute } from "next";

import { archivePaths, postPath, type PublicArchives } from "@/features/posts/archives";
import type { PostSummary } from "@/features/posts/types";
import { staticPagePath, type PageLink } from "@/features/pages/model";

// Builds sitemap entries from published content only: the inputs come from
// anonymous, RLS-filtered reads, so drafts, member previews, and redirected
// old slugs (which live in post_slug_redirects, not in posts.slug) never
// appear. Without a site origin there is no valid absolute URL to list.
export function buildSitemap(input: {
  siteUrl: URL | null;
  posts: readonly PostSummary[];
  archives: PublicArchives;
  // Published static pages (Phase 28); drafts never reach this input.
  pages?: readonly PageLink[];
}): MetadataRoute.Sitemap {
  const { siteUrl, posts, archives, pages = [] } = input;
  if (!siteUrl) return [];

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
    ...pages.map((page) => ({ url: url(staticPagePath(page.slug)), lastModified: page.updatedAt })),
  ];
}

// Crawlers may read public pages only. Admin, sign-in, and invitation routes
// also send noindex; robots.txt keeps them from being crawled at all. Without
// a configured site origin (no canonical URLs possible) nothing is crawlable.
export function buildRobots(siteUrl: URL | null): MetadataRoute.Robots {
  if (!siteUrl) return { rules: { userAgent: "*", disallow: "/" } };

  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/admin", "/login", "/auth"],
    },
    sitemap: new URL("/sitemap.xml", siteUrl).href,
  };
}
