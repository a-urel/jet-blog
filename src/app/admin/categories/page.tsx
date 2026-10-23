import type { Metadata } from "next";
import Link from "next/link";
import { FolderTree } from "lucide-react";

import { QueryStatus } from "@/components/status/query-status";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { FormAlert } from "@/features/auth/components/form-alert";
import { createCategoryAction } from "@/features/taxonomy/actions";
import { listAdminCategories } from "@/features/taxonomy/admin-data";
import { taxonomyAccessDenial } from "@/features/taxonomy/components/taxonomy-admin-guard";
import { TaxonomyForm } from "@/features/taxonomy/components/taxonomy-form";
import { flattenCategoryTree } from "@/features/taxonomy/tree";

export const metadata: Metadata = {
  title: "Kategoriler",
};

const statusMessages: Record<string, string> = {
  created: "Kategori oluşturuldu.",
  updated: "Kategori güncellendi.",
  deleted: "Kategori silindi.",
};

export default async function AdminCategoriesPage({
  searchParams,
}: PageProps<"/admin/categories">) {
  const denial = await taxonomyAccessDenial();
  if (denial) return denial;

  const [{ status }, categories] = await Promise.all([searchParams, listAdminCategories()]);
  const statusMessage = typeof status === "string" ? (statusMessages[status] ?? null) : null;
  const tree = flattenCategoryTree(categories);

  return (
    <div className="space-y-8">
      <div className="space-y-2">
        <h1 className="text-3xl font-semibold tracking-tight">Kategoriler</h1>
        <p className="text-muted-foreground">
          Her yazı tek bir kategoriye bağlıdır. Üst kategori arşivleri alt
          kategorilerin yazılarını da listeler.
        </p>
      </div>

      {statusMessage ? (
        <QueryStatus>
          <FormAlert tone="success">{statusMessage}</FormAlert>
        </QueryStatus>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FolderTree aria-hidden="true" className="size-5" />
            Kategori ağacı
          </CardTitle>
          <CardDescription>
            Yazı sayısı taslakları da içerir. Düzenlemek, taşımak veya silmek için
            bir kategori seçin.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {tree.length === 0 ? (
            <p className="text-sm text-muted-foreground">Henüz kategori yok.</p>
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
                  <Badge variant="secondary">{category.postCount} yazı</Badge>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Yeni kategori</CardTitle>
          <CardDescription>
            Ad benzersiz olmalı (büyük/küçük harf fark etmez).
          </CardDescription>
        </CardHeader>
        <CardContent>
          <TaxonomyForm
            kind="category"
            action={createCategoryAction}
            submitLabel="Kategori oluştur"
            parentOptions={tree.map(({ id, name, depth }) => ({ id, name, depth }))}
          />
        </CardContent>
      </Card>
    </div>
  );
}
