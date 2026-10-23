import type { Metadata } from "next";
import Link from "next/link";

import { Button } from "@/components/ui/button";

// Unknown, unpublished, and empty-archive URLs never get indexed.
export const metadata: Metadata = {
  title: "Sayfa bulunamadı",
  robots: { index: false, follow: false },
};

export default function NotFound() {
  return (
    <div className="mx-auto max-w-3xl px-6 py-24">
      <p className="mb-3 text-sm font-medium text-muted-foreground">404</p>
      <h1 className="text-3xl font-semibold">Sayfa bulunamadı</h1>
      <p className="mt-4 mb-8 text-muted-foreground">
        Bu bağlantıya ait bir içerik yok. Diğer yazılara göz atabilirsiniz.
      </p>
      <Button asChild><Link href="/">Yazılara dön</Link></Button>
    </div>
  );
}
