import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { isUuid } from "@/features/posts/admin/validation";
import { deleteCategoryAction, updateCategoryAction } from "@/features/taxonomy/actions";
import { listAdminCategories } from "@/features/taxonomy/admin-data";
import { DeleteTaxonomyForm } from "@/features/taxonomy/components/delete-taxonomy-form";
import { taxonomyAccessDenial } from "@/features/taxonomy/components/taxonomy-admin-guard";
import { TaxonomyForm } from "@/features/taxonomy/components/taxonomy-form";
import { flattenCategoryTree, parentOptions } from "@/features/taxonomy/tree";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("adminTaxonomy.category");
  return { title: t("metaTitle") };
}

export default async function AdminCategoryPage({
  params,
}: PageProps<"/[locale]/admin/categories/[id]">) {
  const denial = await taxonomyAccessDenial();
  if (denial) return denial;

  const { id } = await params;
  if (!isUuid(id)) notFound();

  const [categories, t, tForm] = await Promise.all([
    listAdminCategories(),
    getTranslations("adminTaxonomy.category"),
    getTranslations("admin.form"),
  ]);
  const category = categories.find((candidate) => candidate.id === id);
  if (!category) notFound();

  const childCount = categories.filter((candidate) => candidate.parentId === id).length;
  const parent = categories.find((candidate) => candidate.id === category.parentId);
  const toOption = ({ id: optionId, name, depth }: { id: string; name: string; depth: number }) => ({
    id: optionId,
    name,
    depth,
  });
  const targets = flattenCategoryTree(categories)
    .filter((candidate) => candidate.id !== id)
    .map(toOption);
  const record = { id: category.id, updatedAt: category.updatedAt };

  return (
    <div className="space-y-8">
      <div className="space-y-2">
        <Button asChild variant="ghost" size="sm" className="-ml-3">
          <Link href="/admin/categories">{t("back")}</Link>
        </Button>
        <h1 className="text-3xl font-semibold tracking-tight">{category.name}</h1>
        <p className="text-muted-foreground">
          {t("summary", { posts: category.postCount, children: childCount })}
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{t("editTitle")}</CardTitle>
          <CardDescription>{t("editDescription")}</CardDescription>
        </CardHeader>
        <CardContent>
          <TaxonomyForm
            kind="category"
            action={updateCategoryAction}
            submitLabel={tForm("save")}
            record={record}
            initialValues={{
              name: category.name,
              slug: category.slug,
              description: category.description ?? "",
              parentId: category.parentId ?? "",
              sortOrder: String(category.sortOrder),
            }}
            parentOptions={parentOptions(categories, id).map(toOption)}
          />
        </CardContent>
      </Card>

      <Card className="border-destructive/40">
        <CardHeader>
          <CardTitle>{t("deleteTitle")}</CardTitle>
          <CardDescription>
            {category.postCount > 0
              ? t("deleteMovesPosts", { count: category.postCount })
              : t("deleteNoPosts")}{" "}
            {childCount > 0
              ? parent
                ? t("deleteMovesChildrenToParent", { count: childCount, parent: parent.name })
                : t("deleteMovesChildrenToRoot", { count: childCount })
              : null}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {targets.length === 0 && category.postCount > 0 ? (
            <p className="text-sm text-muted-foreground">{t("noTargets")}</p>
          ) : (
            <DeleteTaxonomyForm
              action={deleteCategoryAction}
              record={record}
              targetOptions={targets}
              targetRequired={category.postCount > 0}
              confirmLabel={t("confirm", { name: category.name })}
            />
          )}
        </CardContent>
      </Card>
    </div>
  );
}
