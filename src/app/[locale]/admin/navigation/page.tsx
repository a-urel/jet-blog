import type { Metadata } from "next";
import Link from "next/link";
import { CircleAlert } from "lucide-react";
import { getTranslations } from "next-intl/server";

import { QueryStatusToast } from "@/components/status/query-status";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { NavigationForm } from "@/features/pages/admin/components/navigation-form";
import { pageAccessDenial } from "@/features/pages/admin/components/page-admin-guard";
import { getAdminNavigation, listAdminPages } from "@/features/pages/admin/data";
import { navigationLocations } from "@/features/pages/navigation";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("adminPages.navigation");
  return { title: t("title") };
}

const savedStatuses = ["header-saved", "footer-saved"] as const;

export default async function AdminNavigationPage({
  searchParams,
}: PageProps<"/[locale]/admin/navigation">) {
  const denial = await pageAccessDenial();
  if (denial) return denial;

  const [{ status }, { menus }, { pages, error: pagesError }, t] = await Promise.all([
    searchParams,
    getAdminNavigation(),
    listAdminPages(),
    getTranslations("adminPages.navigation"),
  ]);
  const saved = savedStatuses.find((value) => value === status);
  const pageOptions = pages.map((page) => ({
    id: page.id,
    title: page.title,
    published: page.status === "published",
  }));

  return (
    <div className="space-y-8">
      <div className="space-y-2">
        <p className="text-sm text-muted-foreground">
          <Link href="/admin/pages" className="underline-offset-4 hover:underline">
            {t("pages")}
          </Link>{" "}
          / {t("title")}
        </p>
        <h1 className="text-3xl font-semibold tracking-tight">{t("title")}</h1>
        <p className="text-muted-foreground">{t("intro")}</p>
      </div>

      {saved ? <QueryStatusToast message={t(`saved.${saved === "header-saved" ? "header" : "footer"}`)} /> : null}

      {!menus || pagesError ? (
        <p
          role="alert"
          className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive"
        >
          <CircleAlert aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
          {t("loadError")}
        </p>
      ) : (
        navigationLocations.map((location) => (
          <Card key={location}>
            <CardHeader>
              <CardTitle>{t(`menus.${location}.title`)}</CardTitle>
              <CardDescription>{t(`menus.${location}.description`)}</CardDescription>
            </CardHeader>
            <CardContent>
              <NavigationForm
                key={menus[location].revision}
                location={location}
                revision={menus[location].revision}
                items={menus[location].items}
                pages={pageOptions}
              />
            </CardContent>
          </Card>
        ))
      )}
    </div>
  );
}
