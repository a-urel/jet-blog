import type { ReactNode } from "react";
import { Rss } from "lucide-react";
import { useTranslations } from "next-intl";

import { archiveFeedPath, feedContentType } from "@/features/seo/feed";
import { getConfiguredSiteUrl } from "@/lib/site-url";
import type { PostPage } from "../pagination";
import { PostList } from "./post-list";
import { PageCount } from "./page-count";
import { PostPagination } from "./post-pagination";

// Shared frame for the category, tag, and author archive pages. basePath is
// the archive's page-1 URL; its feed sits next to it (archiveFeedPath) and is
// linked only with a site origin, like the site feed in the footer.
export function ArchiveLayout({
  eyebrow,
  title,
  avatar,
  description,
  children,
  basePath,
  posts,
}: {
  eyebrow: string;
  title: string;
  // Shown beside the title, for example the author's avatar.
  avatar?: ReactNode;
  description?: string | null;
  children?: ReactNode;
  basePath: string;
  posts: PostPage;
}) {
  const t = useTranslations("archives");
  const feedPath = getConfiguredSiteUrl() ? archiveFeedPath(basePath) : null;

  return (
    <div className="mx-auto max-w-5xl px-6 py-12 sm:py-20">
      <header className="mb-12 max-w-2xl space-y-4">
        <p className="text-sm font-medium text-muted-foreground">{eyebrow}</p>
        {avatar ? (
          <div className="flex items-center gap-5">
            {avatar}
            <h1 className="text-4xl leading-tight font-semibold tracking-tight sm:text-5xl">
              {title}
            </h1>
          </div>
        ) : (
          <h1 className="text-4xl leading-tight font-semibold tracking-tight sm:text-5xl">
            {title}
          </h1>
        )}
        {description ? (
          <p className="text-lg leading-relaxed text-muted-foreground">{description}</p>
        ) : null}
        {children}
        {feedPath ? (
          <p className="text-sm">
            <a
              href={feedPath}
              type={feedContentType}
              className="inline-flex items-center gap-1.5 rounded-sm text-muted-foreground hover:text-foreground hover:underline underline-offset-4"
            >
              <Rss aria-hidden="true" className="size-4" />
              {t("feed")}
            </a>
          </p>
        ) : null}
      </header>
      <section aria-labelledby="archive-posts-title">
        <div className="mb-6 flex items-baseline justify-between gap-4 border-b pb-4">
          <h2 id="archive-posts-title" className="text-xl font-semibold">{t("posts")}</h2>
          <PageCount {...posts} />
        </div>
        <PostList posts={posts.posts} />
        <PostPagination basePath={basePath} page={posts.page} pageCount={posts.pageCount} />
      </section>
    </div>
  );
}
