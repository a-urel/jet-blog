"use client";

import "./globals.css";

// Replaces the root layout when the layout itself fails, so it renders its own
// document. globals.css carries the system light/dark tokens.
export default function GlobalError({ retry }: { error: unknown; retry: () => void }) {
  return (
    <html lang="tr" className="h-full antialiased">
      <body className="flex min-h-full flex-col">
        <title>Bir hata oluştu</title>
        <meta name="robots" content="noindex, nofollow" />
        <main role="alert" className="mx-auto max-w-3xl px-6 py-24">
          <p className="mb-3 text-sm font-medium text-destructive">Hata</p>
          <h1 className="text-3xl font-semibold">Site şu anda yüklenemedi</h1>
          <p className="mt-4 mb-8 text-muted-foreground">
            Beklenmeyen bir hata oluştu. Birazdan tekrar deneyin.
          </p>
          <button
            type="button"
            onClick={() => retry()}
            className="inline-flex h-9 items-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
          >
            Tekrar dene
          </button>
        </main>
      </body>
    </html>
  );
}
