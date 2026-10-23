import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

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

export const metadata: Metadata = {
  title: "Kategori düzenle",
};

export default async function AdminCategoryPage({
  params,
}: PageProps<"/admin/categories/[id]">) {
  const denial = await taxonomyAccessDenial();
  if (denial) return denial;

  const { id } = await params;
  if (!isUuid(id)) notFound();

  const categories = await listAdminCategories();
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
          <Link href="/admin/categories">← Kategoriler</Link>
        </Button>
        <h1 className="text-3xl font-semibold tracking-tight">{category.name}</h1>
        <p className="text-muted-foreground">
          {category.postCount} yazı · {childCount} alt kategori
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Kategoriyi düzenle</CardTitle>
          <CardDescription>
            Üst kategoriyi değiştirerek kategoriyi alt kategorileriyle birlikte
            taşıyabilirsiniz. Kendi altına taşınamaz.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <TaxonomyForm
            kind="category"
            action={updateCategoryAction}
            submitLabel="Kaydet"
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
          <CardTitle>Kategoriyi sil</CardTitle>
          <CardDescription>
            {category.postCount > 0
              ? `Bu kategorideki ${category.postCount} yazı seçtiğiniz kategoriye taşınır ve eski arşiv adresi oraya yönlenir.`
              : "Bu kategoride yazı yok. İsterseniz eski arşiv adresini başka bir kategoriye yönlendirebilirsiniz."}{" "}
            {childCount > 0
              ? `${childCount} alt kategori ${parent ? `"${parent.name}" altına` : "en üst seviyeye"} taşınır.`
              : null}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {targets.length === 0 && category.postCount > 0 ? (
            <p className="text-sm text-muted-foreground">
              Yazıların taşınabileceği başka kategori yok. Önce yeni bir kategori
              oluşturun.
            </p>
          ) : (
            <DeleteTaxonomyForm
              action={deleteCategoryAction}
              record={record}
              targetOptions={targets}
              targetRequired={category.postCount > 0}
              confirmLabel={`"${category.name}" kategorisinin silineceğini anlıyorum.`}
            />
          )}
        </CardContent>
      </Card>
    </div>
  );
}
