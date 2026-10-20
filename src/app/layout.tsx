import type { Metadata } from "next";
import Link from "next/link";
import { BookOpen } from "lucide-react";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "Yazılar",
    template: "%s | Yazılar",
  },
  description: "Fikirler, notlar ve birlikte üretilen yazılar. Örnek blog.",
  robots: { index: false, follow: false },
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
          <div className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-6 py-6">
            <Link href="/" className="flex items-center gap-2 font-semibold">
              <BookOpen aria-hidden="true" className="size-5" />
              Yazılar
            </Link>
            <span className="text-sm text-muted-foreground">Örnek içerikler</span>
          </div>
        </header>
        <main id="main-content" tabIndex={-1} className="flex-1">
          {children}
        </main>
        <footer className="mt-16 border-t">
          <div className="mx-auto flex max-w-5xl flex-wrap justify-between gap-2 px-6 py-6 text-sm text-muted-foreground">
            <p>Birlikte düşünmek, birlikte yazmak.</p>
            <p>Görünüm sistem temanızı izler.</p>
          </div>
        </footer>
      </body>
    </html>
  );
}
