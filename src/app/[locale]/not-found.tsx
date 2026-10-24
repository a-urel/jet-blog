import type { Metadata } from "next";
import Link from "next/link";
import { getTranslations } from "next-intl/server";

import { Button } from "@/components/ui/button";

// Unknown, unpublished, and empty-archive URLs never get indexed.
export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("common.missingPage");
  return {
    title: t("title"),
    robots: { index: false, follow: false },
  };
}

export default async function NotFound() {
  const t = await getTranslations("common.missingPage");

  return (
    <div className="mx-auto max-w-3xl px-6 py-24">
      <p className="mb-3 text-sm font-medium text-muted-foreground">404</p>
      <h1 className="text-3xl font-semibold">{t("title")}</h1>
      <p className="mt-4 mb-8 text-muted-foreground">{t("description")}</p>
      <Button asChild><Link href="/">{t("back")}</Link></Button>
    </div>
  );
}
