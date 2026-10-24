"use client";

import { defaultInterfaceLocale, localeCookieName, resolveInterfaceLocale } from "@/lib/interface-locales";

import "./globals.css";

// Replaces the root layout when the layout itself fails, so it renders its own
// document without the message provider. Its few strings are inlined for each
// interface locale; the locale comes from the same cookie and browser
// languages as src/proxy.ts. globals.css carries the system light/dark tokens.
const copy = {
  tr: {
    title: "Bir hata oluştu",
    label: "Hata",
    heading: "Site şu anda yüklenemedi",
    description: "Beklenmeyen bir hata oluştu. Birazdan tekrar deneyin.",
    retry: "Tekrar dene",
  },
  en: {
    title: "Something went wrong",
    label: "Error",
    heading: "The site cannot be loaded right now",
    description: "An unexpected error occurred. Please try again shortly.",
    retry: "Try again",
  },
  de: {
    title: "Ein Fehler ist aufgetreten",
    label: "Fehler",
    heading: "Die Website kann gerade nicht geladen werden",
    description: "Ein unerwarteter Fehler ist aufgetreten. Bitte versuchen Sie es gleich noch einmal.",
    retry: "Erneut versuchen",
  },
};

function clientLocale() {
  if (typeof document === "undefined") return defaultInterfaceLocale;
  const cookie = document.cookie
    .split("; ")
    .find((entry) => entry.startsWith(`${localeCookieName}=`))
    ?.slice(localeCookieName.length + 1);
  return resolveInterfaceLocale(cookie, navigator.languages.join(","));
}

export default function GlobalError({ retry }: { error: unknown; retry: () => void }) {
  const locale = clientLocale();
  const t = copy[locale];

  return (
    <html lang={locale} className="h-full antialiased">
      <body className="flex min-h-full flex-col">
        <title>{t.title}</title>
        <meta name="robots" content="noindex, nofollow" />
        <main role="alert" className="mx-auto max-w-3xl px-6 py-24">
          <p className="mb-3 text-sm font-medium text-destructive">{t.label}</p>
          <h1 className="text-3xl font-semibold">{t.heading}</h1>
          <p className="mt-4 mb-8 text-muted-foreground">{t.description}</p>
          <button
            type="button"
            onClick={() => retry()}
            className="inline-flex h-9 items-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
          >
            {t.retry}
          </button>
        </main>
      </body>
    </html>
  );
}
