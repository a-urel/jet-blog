import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";

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

export async function generateMetadata({ searchParams }: PageProps<"/search">): Promise<Metadata> {
  const input = parseSearchQuery((await searchParams).q);
  return {
    ...noIndexMetadata,
    title: input.kind === "query" ? `“${input.query}” araması` : "Arama",
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
  if (!isSupabaseConfigured()) {
    return <Notice>Arama şu anda kullanılamıyor.</Notice>;
  }

  // Only real queries count against the per-IP limit; the empty, too-short,
  // and invalid states above never reach the database.
  const limit = await consumeSearchRateLimit();
  if (limit === "limited") {
    return <Notice>Çok fazla arama yapıldı. Bir dakika sonra tekrar deneyin.</Notice>;
  }
  if (limit === "unavailable") {
    return <Notice>Arama şu anda kullanılamıyor. Daha sonra tekrar deneyin.</Notice>;
  }

  const result = await searchPublishedPosts(query, page, language);
  const languageNote = language ? ` (${postLanguageName(language) ?? language})` : "";

  if (result.results.length === 0) {
    if (page > 1) {
      return (
        <Notice>
          Bu sayfada sonuç yok.{" "}
          <Link href={searchUrl(query, { language })} className="underline underline-offset-4">
            İlk sayfaya dönün
          </Link>
          .
        </Notice>
      );
    }

    return (
      <Notice>
        “{query}” için sonuç bulunamadı{languageNote}. Farklı ya da daha az sözcükle
        deneyin.
      </Notice>
    );
  }

  return (
    <section aria-labelledby="search-results-title">
      <div className="mb-4 flex items-baseline justify-between gap-4">
        <h2 id="search-results-title" className="sr-only">
          Sonuçlar
        </h2>
        <p role="status" className="text-sm text-muted-foreground">
          “{query}” için {result.total} sonuç{languageNote}
          {result.pageCount > 1 ? ` · Sayfa ${page} / ${result.pageCount}` : null}
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

export default async function SearchPage({ searchParams }: PageProps<"/search">) {
  const params = await searchParams;
  const input = parseSearchQuery(params.q);
  const language = parseSearchLanguage(params.language);
  const page = parseSearchPage(params.page);

  return (
    <div className="mx-auto max-w-5xl px-6 py-12 sm:py-20">
      <header className="mb-10 max-w-3xl space-y-6">
        <h1 className="text-4xl leading-tight font-semibold tracking-tight sm:text-5xl">Arama</h1>
        <SearchForm
          variant="page"
          query={input.kind === "empty" ? "" : input.query}
          language={language}
        />
      </header>
      {input.kind === "empty" ? (
        <Notice>Yayımlanmış yazıların başlık, özet ve metinlerinde arama yapın.</Notice>
      ) : input.kind === "too-short" ? (
        <Notice>{`Aramak için en az ${minSearchQueryLength} karakter yazın.`}</Notice>
      ) : input.kind === "too-long" ? (
        <Notice>{`Arama en fazla ${maxSearchQueryLength} karakter olabilir.`}</Notice>
      ) : page === null ? (
        <Notice>
          Geçersiz sayfa.{" "}
          <Link href={searchUrl(input.query, { language })} className="underline underline-offset-4">
            İlk sayfaya dönün
          </Link>
          .
        </Notice>
      ) : (
        <Results query={input.query} language={language} page={page} />
      )}
    </div>
  );
}
