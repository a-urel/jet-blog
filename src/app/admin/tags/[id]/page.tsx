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
import { deleteTagAction, updateTagAction } from "@/features/taxonomy/actions";
import { listAdminTags } from "@/features/taxonomy/admin-data";
import { DeleteTaxonomyForm } from "@/features/taxonomy/components/delete-taxonomy-form";
import { taxonomyAccessDenial } from "@/features/taxonomy/components/taxonomy-admin-guard";
import { TaxonomyForm } from "@/features/taxonomy/components/taxonomy-form";

export const metadata: Metadata = {
  title: "Etiket düzenle",
};

export default async function AdminTagPage({ params }: PageProps<"/admin/tags/[id]">) {
  const denial = await taxonomyAccessDenial();
  if (denial) return denial;

  const { id } = await params;
  if (!isUuid(id)) notFound();

  const tag = (await listAdminTags()).find((candidate) => candidate.id === id);
  if (!tag) notFound();

  const record = { id: tag.id, updatedAt: tag.updatedAt };

  return (
    <div className="space-y-8">
      <div className="space-y-2">
        <Button asChild variant="ghost" size="sm" className="-ml-3">
          <Link href="/admin/tags">← Etiketler</Link>
        </Button>
        <h1 className="text-3xl font-semibold tracking-tight">{tag.name}</h1>
        <p className="text-muted-foreground">{tag.postCount} yazı</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Etiketi düzenle</CardTitle>
        </CardHeader>
        <CardContent>
          <TaxonomyForm
            kind="tag"
            action={updateTagAction}
            submitLabel="Kaydet"
            record={record}
            initialValues={{
              name: tag.name,
              slug: tag.slug,
              description: tag.description ?? "",
            }}
          />
        </CardContent>
      </Card>

      <Card className="border-destructive/40">
        <CardHeader>
          <CardTitle>Etiketi sil</CardTitle>
          <CardDescription>
            {tag.postCount > 0
              ? `Etiket ${tag.postCount} yazıdan kaldırılır. Eski arşiv adresi 404 döner.`
              : "Bu etiket hiçbir yazıda kullanılmıyor."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <DeleteTaxonomyForm
            action={deleteTagAction}
            record={record}
            confirmLabel={
              tag.postCount > 0
                ? `"${tag.name}" etiketinin ${tag.postCount} yazıdan kaldırılıp silineceğini anlıyorum.`
                : `"${tag.name}" etiketinin silineceğini anlıyorum.`
            }
          />
        </CardContent>
      </Card>
    </div>
  );
}
