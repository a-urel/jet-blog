import type { Metadata } from "next";
import Link from "next/link";
import { Tags } from "lucide-react";
import { getTranslations } from "next-intl/server";

import { QueryStatusToast } from "@/components/status/query-status";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { createTagAction } from "@/features/taxonomy/actions";
import { listAdminTags } from "@/features/taxonomy/admin-data";
import { taxonomyAccessDenial } from "@/features/taxonomy/components/taxonomy-admin-guard";
import { TaxonomyForm } from "@/features/taxonomy/components/taxonomy-form";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("adminTaxonomy.tags");
  return { title: t("title") };
}

const statuses = ["created", "updated", "deleted"] as const;

function isStatus(value: unknown): value is (typeof statuses)[number] {
  return statuses.includes(value as (typeof statuses)[number]);
}

export default async function AdminTagsPage({ searchParams }: PageProps<"/[locale]/admin/tags">) {
  const denial = await taxonomyAccessDenial();
  if (denial) return denial;

  const [{ status }, tags, t] = await Promise.all([
    searchParams,
    listAdminTags(),
    getTranslations("adminTaxonomy"),
  ]);
  const statusMessage = isStatus(status) ? t(`tags.status.${status}`) : null;

  return (
    <div className="space-y-8">
      <div className="space-y-2">
        <h1 className="text-3xl font-semibold tracking-tight">{t("tags.title")}</h1>
        <p className="text-muted-foreground">{t("tags.intro")}</p>
      </div>

      {statusMessage ? <QueryStatusToast message={statusMessage} /> : null}

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Tags aria-hidden="true" className="size-5" />
            {t("tags.listTitle")}
          </CardTitle>
          <CardDescription>{t("tags.listDescription")}</CardDescription>
        </CardHeader>
        <CardContent>
          {tags.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("tags.empty")}</p>
          ) : (
            <ul className="divide-y rounded-lg border">
              {tags.map((tag) => (
                <li
                  key={tag.id}
                  className="flex flex-wrap items-center justify-between gap-2 px-3 py-2"
                >
                  <div className="min-w-0">
                    <Link
                      href={`/admin/tags/${tag.id}`}
                      className="font-medium underline-offset-4 hover:underline"
                    >
                      {tag.name}
                    </Link>
                    <p className="truncate text-xs text-muted-foreground">/tags/{tag.slug}</p>
                  </div>
                  <Badge variant="secondary">{t("postCount", { count: tag.postCount })}</Badge>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t("tags.newTitle")}</CardTitle>
          <CardDescription>{t("tags.newDescription")}</CardDescription>
        </CardHeader>
        <CardContent>
          <TaxonomyForm kind="tag" action={createTagAction} submitLabel={t("tags.create")} />
        </CardContent>
      </Card>
    </div>
  );
}
