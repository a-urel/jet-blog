import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { locale as rootLocale } from "next/root-params";
import { BookOpen } from "lucide-react";
import { getTranslations } from "next-intl/server";

import { LanguageSwitcher } from "@/components/language-switcher";
import { Toaster } from "@/components/ui/sonner";
import { AccountNavLink } from "@/features/account/components/account-nav-link";
import { HeaderSearchSlot } from "@/features/search/components/header-search-slot";
import { SearchForm } from "@/features/search/components/search-form";
import { feedAlternateTypes, feedPath } from "@/features/seo/feed";
import { defaultSocialImage, socialImages } from "@/features/seo/metadata";
import { publicClientMessages } from "@/i18n/client-messages";
import { ClientMessages } from "@/i18n/client-messages-provider";
import {
  interfaceLocales,
  interfaceOpenGraphLocales,
  isInterfaceLocale,
} from "@/lib/interface-locales";
import { getConfiguredSiteUrl, getSiteName } from "@/lib/site-url";
import "../globals.css";

const siteUrl = getConfiguredSiteUrl();
const siteName = getSiteName();

// Every interface locale is prerendered; src/proxy.ts rewrites each request to
// one of them. Public URLs never contain the locale.
export function generateStaticParams() {
  return interfaceLocales.map((locale) => ({ locale }));
}

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("common");
  const locale = await rootLocale();
  const siteDescription = t("site.description");
  // src/app/opengraph-image.tsx sits outside the [locale] root layout, so its
  // file convention no longer reaches the pages; declare it explicitly.
  const social = socialImages(defaultSocialImage(siteName, siteUrl), {
    title: siteName,
    description: siteDescription,
  });

  return {
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
      locale: isInterfaceLocale(locale) ? interfaceOpenGraphLocales[locale] : undefined,
      title: siteName,
      description: siteDescription,
      ...social.openGraph,
    },
    twitter: social.twitter,
    // Public pages are indexable only with a configured site origin (canonical
    // URLs need one). Admin, sign-in, invitation, and preview routes, plus every
    // 404, override this with noindex.
    robots: siteUrl ? { index: true, follow: true } : { index: false, follow: false },
  };
}

export default async function RootLayout({ children }: LayoutProps<"/[locale]">) {
  const locale = await rootLocale();
  // Only src/proxy.ts produces this segment, always with a supported locale.
  if (!isInterfaceLocale(locale)) notFound();

  const t = await getTranslations("common.layout");

  return (
    <html lang={locale} className="h-full antialiased">
      <body className="flex min-h-full flex-col">
        <ClientMessages paths={publicClientMessages}>
          <a
            href="#main-content"
            className="sr-only rounded-md bg-background p-3 focus:not-sr-only focus:absolute focus:top-3 focus:left-3 focus:z-50"
          >
            {t("skipToContent")}
          </a>
          <header className="border-b">
            <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-x-4 gap-y-3 px-6 py-6">
              <Link href="/" className="flex items-center gap-2 font-semibold">
                <BookOpen aria-hidden="true" className="size-5" />
                {siteName}
              </Link>
              {/* Static GET form: public pages stay prerendered. Hidden on
                  /search, which has its own form. */}
              <HeaderSearchSlot>
                <SearchForm variant="header" />
              </HeaderSearchSlot>
              <div className="flex items-center gap-2">
                {/* Sets the locale cookie on the client: the page itself
                    stays static per locale. */}
                <LanguageSwitcher />
                {/* Prerendered as a generic icon; the visitor's avatar loads in
                    the browser, so public pages stay static. */}
                <AccountNavLink label={t("account")} />
              </div>
            </div>
          </header>
          <main id="main-content" tabIndex={-1} className="flex-1">
            {children}
          </main>
          <footer className="mt-16 border-t">
            <div className="mx-auto flex max-w-5xl flex-wrap justify-between gap-2 px-6 py-6 text-sm text-muted-foreground">
              <p>{t("tagline")}</p>
              <p className="flex items-center gap-2">
                <span>{t("themeNote")}</span>
                <span aria-hidden="true">·</span>
                {siteUrl ? (
                  <>
                    <a
                      href={feedPath}
                      type="application/atom+xml"
                      className="rounded-sm hover:text-foreground hover:underline underline-offset-4"
                    >
                      {t("feed")}
                    </a>
                    <span aria-hidden="true">·</span>
                  </>
                ) : null}
                <Link
                  href="/admin"
                  className="rounded-sm hover:text-foreground hover:underline underline-offset-4"
                >
                  {t("admin")}
                </Link>
              </p>
            </div>
          </footer>
          {/* The one toast region for the public site and the nested admin
              layout; a second Toaster would show every toast twice. It is
              a client island with no request data, so pages stay static. */}
          <Toaster containerAriaLabel={t("notifications")} />
        </ClientMessages>
      </body>
    </html>
  );
}
