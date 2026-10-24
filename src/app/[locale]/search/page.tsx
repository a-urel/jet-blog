import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import { getLocale, getTranslations } from "next-intl/server";

import { postLanguageName, type PostLanguage } from "@/features/posts/language";
import { SearchForm } from "@/features/search/components/search-form";
import { SearchPagination } from "@/features/search/components/search-pagination";
import { SearchResults } from "@/features/search/components/search-results";
import { searchPublishedPosts } from "@/features/search/data";
import {
  maxSearchQueryLength,
  minSearchQueryLength,
  parseSearchLanguage,
  parseSearchPage,
  parseSearchQuery,
  searchUrl,
} from "@/features/search/query";
import { consumeSearchRateLimit } from "@/features/search/rate-limit";
import { noIndexMetadata } from "@/features/seo/metadata";
import { isSupabaseConfigured } from "@/lib/supabase/env";

// Full-text search over published posts. searchParams and the rate limit's
// request headers make this route dynamic: every request renders on the
// server and nothing is prerendered, ISR-cached, or listed in the sitemap.
// noindex keeps result pages out of search engines.

export async function generateMetadata({ searchParams }: PageProps<"/[locale]/search">): Promise<Metadata> {
  const input = parseSearchQuery((await searchParams).q);
  const t = await getTranslations("search");
  return {
    ...noIndexMetadata,
    title: input.kind === "query" ? t("queryTitle", { query: input.query }) : t("title"),
  };
}

function Notice({ children }: { children: ReactNode }) {
  return (
    <p role="status" className="rounded-lg border bg-muted/40 p-4 text-muted-foreground">
      {children}
    </p>
  );
}

async function Results({
  query,
  language,
  page,
}: {
  query: string;
  language: PostLanguage | null;
  page: number;
}) {
  const t = await getTranslations("search");

  if (!isSupabaseConfigured()) {
    return <Notice>{t("notice.unavailable")}</Notice>;
  }

  // Only real queries count against the per-IP limit; the empty, too-short,
  // and invalid states above never reach the database.
  const limit = await consumeSearchRateLimit();
  if (limit === "limited") {
    return <Notice>{t("notice.rateLimited")}</Notice>;
  }
  if (limit === "unavailable") {
    return <Notice>{t("notice.unavailableRetry")}</Notice>;
  }

  const result = await searchPublishedPosts(query, page, language);
  const languageName = language
    ? (postLanguageName(language, await getLocale()) ?? language)
    : null;

  if (result.results.length === 0) {
    if (page > 1) {
      return (
        <Notice>
          {t.rich("notice.emptyPage", {
            link: (chunks) => (
              <Link href={searchUrl(query, { language })} className="underline underline-offset-4">
                {chunks}
              </Link>
            ),
          })}
        </Notice>
      );
    }

    return (
      <Notice>
        {languageName
          ? t("notice.noResultsInLanguage", { query, language: languageName })
          : t("notice.noResults", { query })}
      </Notice>
    );
  }

  return (
    <section aria-labelledby="search-results-title">
      <div className="mb-4 flex items-baseline justify-between gap-4">
        <h2 id="search-results-title" className="sr-only">
          {t("results.heading")}
        </h2>
        <p role="status" className="text-sm text-muted-foreground">
          {languageName
            ? t("results.countInLanguage", { query, count: result.total, language: languageName })
            : t("results.count", { query, count: result.total })}
          {result.pageCount > 1
            ? ` · ${t("results.page", { page, pageCount: result.pageCount })}`
            : null}
        </p>
      </div>
      <SearchResults results={result.results} />
      <SearchPagination
        query={query}
        language={language}
        page={page}
        pageCount={result.pageCount}
      />
    </section>
  );
}

export default async function SearchPage({ searchParams }: PageProps<"/[locale]/search">) {
  const params = await searchParams;
  const input = parseSearchQuery(params.q);
  const language = parseSearchLanguage(params.language);
  const page = parseSearchPage(params.page);
  const t = await getTranslations("search");

  return (
    <div className="mx-auto max-w-5xl px-6 py-12 sm:py-20">
      <header className="mb-10 max-w-3xl space-y-6">
        <h1 className="text-4xl leading-tight font-semibold tracking-tight sm:text-5xl">{t("title")}</h1>
        <SearchForm
          variant="page"
          query={input.kind === "empty" ? "" : input.query}
          language={language}
        />
      </header>
      {input.kind === "empty" ? (
        <Notice>{t("notice.intro")}</Notice>
      ) : input.kind === "too-short" ? (
        <Notice>{t("notice.tooShort", { min: minSearchQueryLength })}</Notice>
      ) : input.kind === "too-long" ? (
        <Notice>{t("notice.tooLong", { max: maxSearchQueryLength })}</Notice>
      ) : page === null ? (
        <Notice>
          {t.rich("notice.invalidPage", {
            link: (chunks) => (
              <Link
                href={searchUrl(input.query, { language })}
                className="underline underline-offset-4"
              >
                {chunks}
              </Link>
            ),
          })}
        </Notice>
      ) : (
        <Results query={input.query} language={language} page={page} />
      )}
    </div>
  );
}
