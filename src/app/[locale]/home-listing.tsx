import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

import { PageCount } from "@/features/posts/components/page-count";
import { PostList } from "@/features/posts/components/post-list";
import { PostPagination } from "@/features/posts/components/post-pagination";
import { pagePath, type PostPage } from "@/features/posts/pagination";
import { listingMetadataContext } from "@/features/seo/listing-metadata";
import { canonicalAlternates, pageTitle } from "@/features/seo/metadata";

// The home listing, shared by / (page 1) and /page/[page].

export async function homeListingMetadata(page: number): Promise<Metadata> {
  const t = await getTranslations("posts.home");
  const listing = await listingMetadataContext();

  return {
    ...(page > 1 ? { title: pageTitle(t("latest"), page, listing.pageTitle) } : {}),
    alternates: canonicalAlternates(pagePath("/", page)),
  };
}

export async function HomeListing({ posts }: { posts: PostPage }) {
  const t = await getTranslations("posts.home");
  const tPagination = await getTranslations("common.pagination");

  return (
    <div className="mx-auto max-w-5xl px-6 py-12 sm:py-20">
      {posts.page === 1 ? (
        <section aria-labelledby="page-title" className="mb-12 max-w-2xl">
          <h1 id="page-title" className="text-4xl leading-tight font-semibold tracking-tight sm:text-5xl">
            {t("title")}
          </h1>
          <p className="mt-5 text-lg leading-relaxed text-muted-foreground">{t("intro")}</p>
        </section>
      ) : (
        <h1 id="page-title" className="mb-12 text-4xl leading-tight font-semibold tracking-tight">
          {tPagination("pageTitle", { title: t("latest"), page: posts.page })}
        </h1>
      )}

      <section aria-labelledby="posts-title">
        <div className="mb-6 flex items-baseline justify-between gap-4 border-b pb-4">
          <h2 id="posts-title" className="text-xl font-semibold">{t("latest")}</h2>
          <PageCount {...posts} />
        </div>
        {posts.total === 0 ? (
          <p className="rounded-lg border border-dashed px-4 py-10 text-center text-muted-foreground">
            {t("empty")}
          </p>
        ) : null}
        <PostList posts={posts.posts} />
        <PostPagination basePath="/" page={posts.page} pageCount={posts.pageCount} />
      </section>
    </div>
  );
}
