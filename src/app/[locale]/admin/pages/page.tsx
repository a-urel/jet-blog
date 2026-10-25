import type { Metadata } from "next";
import Link from "next/link";
import { CircleAlert, FilePlus2, Menu } from "lucide-react";
import { getFormatter, getTranslations } from "next-intl/server";

import { QueryStatusToast } from "@/components/status/query-status";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { pageAccessDenial } from "@/features/pages/admin/components/page-admin-guard";
import { listAdminPages } from "@/features/pages/admin/data";
import { staticPagePath } from "@/features/pages/model";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("adminPages");
  return { title: t("list.title") };
}

export default async function AdminPagesPage({ searchParams }: PageProps<"/[locale]/admin/pages">) {
  const denial = await pageAccessDenial();
  if (denial) return denial;

  const [{ status }, { pages, error }, t, format] = await Promise.all([
    searchParams,
    listAdminPages(),
    getTranslations("adminPages"),
    getFormatter(),
  ]);

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-2">
          <h1 className="text-3xl font-semibold tracking-tight">{t("list.title")}</h1>
          <p className="text-muted-foreground">{t("list.description")}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button asChild variant="outline">
            <Link href="/admin/navigation">
              <Menu aria-hidden="true" />
              {t("list.navigation")}
            </Link>
          </Button>
          <Button asChild>
            <Link href="/admin/pages/new">
              <FilePlus2 aria-hidden="true" />
              {t("list.newPage")}
            </Link>
          </Button>
        </div>
      </div>

      {status === "deleted" ? <QueryStatusToast message={t("status.deleted")} /> : null}

      {error ? (
        <p
          role="alert"
          className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive"
        >
          <CircleAlert aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
          {t("list.loadError")}
        </p>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>{t("list.cardTitle")}</CardTitle>
            <CardDescription>{t("list.cardDescription")}</CardDescription>
          </CardHeader>
          <CardContent>
            {pages.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t("list.empty")}</p>
            ) : (
              <ul className="divide-y rounded-lg border">
                {pages.map((page) => (
                  <li key={page.id} className="flex flex-wrap items-center justify-between gap-3 px-3 py-3">
                    <div className="min-w-0 space-y-1">
                      <Link
                        href={`/admin/pages/${page.id}`}
                        className="font-medium underline-offset-4 hover:underline"
                      >
                        {page.title}
                      </Link>
                      <p className="truncate text-xs text-muted-foreground">
                        {staticPagePath(page.slug)} ·{" "}
                        {t("list.updated", {
                          updatedAt: format.dateTime(new Date(page.updatedAt), "dateTimeShort"),
                        })}
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {page.kind !== "other" ? (
                        <Badge variant="outline">{t(`kinds.${page.kind}`)}</Badge>
                      ) : null}
                      <Badge variant={page.status === "published" ? "default" : "secondary"}>
                        {t(`statusLabel.${page.status}`)}
                      </Badge>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
