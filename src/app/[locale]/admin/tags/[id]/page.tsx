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
import { deleteTagAction, updateTagAction } from "@/features/taxonomy/actions";
import { listAdminTags } from "@/features/taxonomy/admin-data";
import { DeleteTaxonomyForm } from "@/features/taxonomy/components/delete-taxonomy-form";
import { taxonomyAccessDenial } from "@/features/taxonomy/components/taxonomy-admin-guard";
import { TaxonomyForm } from "@/features/taxonomy/components/taxonomy-form";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("adminTaxonomy.tag");
  return { title: t("metaTitle") };
}

export default async function AdminTagPage({ params }: PageProps<"/[locale]/admin/tags/[id]">) {
  const denial = await taxonomyAccessDenial();
  if (denial) return denial;

  const { id } = await params;
  if (!isUuid(id)) notFound();

  const [tags, t, tForm] = await Promise.all([
    listAdminTags(),
    getTranslations("adminTaxonomy"),
    getTranslations("admin.form"),
  ]);
  const tag = tags.find((candidate) => candidate.id === id);
  if (!tag) notFound();

  const record = { id: tag.id, updatedAt: tag.updatedAt };

  return (
    <div className="space-y-8">
      <div className="space-y-2">
        <Button asChild variant="ghost" size="sm" className="-ml-3">
          <Link href="/admin/tags">{t("tag.back")}</Link>
        </Button>
        <h1 className="text-3xl font-semibold tracking-tight">{tag.name}</h1>
        <p className="text-muted-foreground">{t("postCount", { count: tag.postCount })}</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{t("tag.editTitle")}</CardTitle>
        </CardHeader>
        <CardContent>
          <TaxonomyForm
            kind="tag"
            action={updateTagAction}
            submitLabel={tForm("save")}
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
          <CardTitle>{t("tag.deleteTitle")}</CardTitle>
          <CardDescription>
            {tag.postCount > 0
              ? t("tag.deleteUsed", { count: tag.postCount })
              : t("tag.deleteUnused")}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <DeleteTaxonomyForm
            action={deleteTagAction}
            record={record}
            confirmLabel={
              tag.postCount > 0
                ? t("tag.confirmUsed", { name: tag.name, count: tag.postCount })
                : t("tag.confirm", { name: tag.name })
            }
          />
        </CardContent>
      </Card>
    </div>
  );
}
