import type { Metadata } from "next";
import Link from "next/link";
import { FilePlus2 } from "lucide-react";
import { getTranslations } from "next-intl/server";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { pageAccessDenial } from "@/features/pages/admin/components/page-admin-guard";
import { PageForm } from "@/features/pages/admin/components/page-form";
import { emptyBodyDocument } from "@/features/posts/content/schema";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("adminPages");
  return { title: t("newPage.title") };
}

export default async function NewStaticPage() {
  const denial = await pageAccessDenial();
  if (denial) return denial;

  const t = await getTranslations("adminPages");

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <p className="text-sm text-muted-foreground">
          <Link href="/admin/pages" className="underline-offset-4 hover:underline">
            {t("list.title")}
          </Link>{" "}
          / {t("newPage.title")}
        </p>
        <h1 className="flex items-center gap-2 text-3xl font-semibold tracking-tight">
          <FilePlus2 aria-hidden="true" className="size-7" />
          {t("newPage.title")}
        </h1>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>{t("newPage.cardTitle")}</CardTitle>
          <CardDescription>{t("newPage.cardDescription")}</CardDescription>
        </CardHeader>
        <CardContent>
          <PageForm
            mode="create"
            initialValues={{ title: "", slug: "", metaDescription: "", kind: "other", body: emptyBodyDocument }}
          />
        </CardContent>
      </Card>
    </div>
  );
}
