import type { Metadata } from "next";
import Link from "next/link";
import { BookOpen } from "lucide-react";
import { SearchForm } from "@/features/search/components/search-form";
import { feedAlternateTypes, feedPath } from "@/features/seo/feed";
import { getConfiguredSiteUrl, getSiteName } from "@/lib/site-url";
import "./globals.css";

const siteUrl = getConfiguredSiteUrl();
const siteName = getSiteName();
const siteDescription = "Fikirler, notlar ve birlikte üretilen yazılar. Örnek blog.";

export const metadata: Metadata = {
  // Resolves relative canonical and Open Graph URLs such as /posts/[slug].
  metadataBase: siteUrl,
  title: {
    default: siteName,
    template: `%s | ${siteName}`,
  },
  description: siteDescription,
  // Feed discovery on every page; pages with a canonical URL repeat it
  // (canonicalAlternates), because metadata merges shallowly.
  alternates: { types: feedAlternateTypes(siteUrl, siteName) },
  openGraph: {
    type: "website",
    siteName,
    locale: "tr_TR",
    title: siteName,
    description: siteDescription,
  },
  // Public pages are indexable only with a configured site origin (canonical
  // URLs need one). Admin, sign-in, invitation, and preview routes, plus every
  // 404, override this with noindex.
  robots: siteUrl ? { index: true, follow: true } : { index: false, follow: false },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="tr" className="h-full antialiased">
      <body className="flex min-h-full flex-col">
        <a
          href="#main-content"
          className="sr-only rounded-md bg-background p-3 focus:not-sr-only focus:absolute focus:top-3 focus:left-3 focus:z-50"
        >
          İçeriğe geç
        </a>
        <header className="border-b">
          <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-x-4 gap-y-3 px-6 py-6">
            <Link href="/" className="flex items-center gap-2 font-semibold">
              <BookOpen aria-hidden="true" className="size-5" />
              {siteName}
            </Link>
            <div className="order-last w-full sm:order-none sm:ml-auto sm:w-auto">
              {/* Static GET form: public pages stay prerendered. */}
              <SearchForm variant="header" />
            </div>
            {/* A static link keeps public pages prerendered; /account reads the
                session itself and sends signed-out visitors to /login. */}
            <Link
              href="/account"
              className="rounded-sm text-sm text-muted-foreground hover:text-foreground hover:underline underline-offset-4"
            >
              Hesabım
            </Link>
          </div>
        </header>
        <main id="main-content" tabIndex={-1} className="flex-1">
          {children}
        </main>
        <footer className="mt-16 border-t">
          <div className="mx-auto flex max-w-5xl flex-wrap justify-between gap-2 px-6 py-6 text-sm text-muted-foreground">
            <p>Birlikte düşünmek, birlikte yazmak.</p>
            <p className="flex items-center gap-2">
              <span>Görünüm sistem temanızı izler.</span>
              <span aria-hidden="true">·</span>
              {siteUrl ? (
                <>
                  <a
                    href={feedPath}
                    type="application/atom+xml"
                    className="rounded-sm hover:text-foreground hover:underline underline-offset-4"
                  >
                    Atom akışı
                  </a>
                  <span aria-hidden="true">·</span>
                </>
              ) : null}
              <Link
                href="/admin"
                className="rounded-sm hover:text-foreground hover:underline underline-offset-4"
              >
                Yönetim
              </Link>
            </p>
          </div>
        </footer>
      </body>
    </html>
  );
}
