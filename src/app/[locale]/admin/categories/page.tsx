import type { Metadata } from "next";
import Link from "next/link";
import { FolderTree } from "lucide-react";
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
import { createCategoryAction } from "@/features/taxonomy/actions";
import { listAdminCategories } from "@/features/taxonomy/admin-data";
import { taxonomyAccessDenial } from "@/features/taxonomy/components/taxonomy-admin-guard";
import { TaxonomyForm } from "@/features/taxonomy/components/taxonomy-form";
import { flattenCategoryTree } from "@/features/taxonomy/tree";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("adminTaxonomy.categories");
  return { title: t("title") };
}

const statuses = ["created", "updated", "deleted"] as const;

function isStatus(value: unknown): value is (typeof statuses)[number] {
  return statuses.includes(value as (typeof statuses)[number]);
}

export default async function AdminCategoriesPage({
  searchParams,
}: PageProps<"/[locale]/admin/categories">) {
  const denial = await taxonomyAccessDenial();
  if (denial) return denial;

  const [{ status }, categories, t] = await Promise.all([
    searchParams,
    listAdminCategories(),
    getTranslations("adminTaxonomy"),
  ]);
  const statusMessage = isStatus(status) ? t(`categories.status.${status}`) : null;
  const tree = flattenCategoryTree(categories);

  return (
    <div className="space-y-8">
      <div className="space-y-2">
        <h1 className="text-3xl font-semibold tracking-tight">{t("categories.title")}</h1>
        <p className="text-muted-foreground">{t("categories.intro")}</p>
      </div>

      {statusMessage ? <QueryStatusToast message={statusMessage} /> : null}

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FolderTree aria-hidden="true" className="size-5" />
            {t("categories.treeTitle")}
          </CardTitle>
          <CardDescription>{t("categories.treeDescription")}</CardDescription>
        </CardHeader>
        <CardContent>
          {tree.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("categories.empty")}</p>
          ) : (
            <ul className="divide-y rounded-lg border">
              {tree.map((category) => (
                <li
                  key={category.id}
                  className="flex flex-wrap items-center justify-between gap-2 px-3 py-2"
                  style={{ paddingInlineStart: `${0.75 + category.depth * 1.25}rem` }}
                >
                  <div className="min-w-0">
                    <Link
                      href={`/admin/categories/${category.id}`}
                      className="font-medium underline-offset-4 hover:underline"
                    >
                      {category.name}
                    </Link>
                    <p className="truncate text-xs text-muted-foreground">
                      /categories/{category.slug}
                    </p>
                  </div>
                  <Badge variant="secondary">{t("postCount", { count: category.postCount })}</Badge>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t("categories.newTitle")}</CardTitle>
          <CardDescription>{t("categories.newDescription")}</CardDescription>
        </CardHeader>
        <CardContent>
          <TaxonomyForm
            kind="category"
            action={createCategoryAction}
            submitLabel={t("categories.create")}
            parentOptions={tree.map(({ id, name, depth }) => ({ id, name, depth }))}
          />
        </CardContent>
      </Card>
    </div>
  );
}
