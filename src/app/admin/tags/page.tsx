import type { Metadata } from "next";
import Link from "next/link";
import { Tags } from "lucide-react";

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
import { createTagAction } from "@/features/taxonomy/actions";
import { listAdminTags } from "@/features/taxonomy/admin-data";
import { taxonomyAccessDenial } from "@/features/taxonomy/components/taxonomy-admin-guard";
import { TaxonomyForm } from "@/features/taxonomy/components/taxonomy-form";

export const metadata: Metadata = {
  title: "Etiketler",
};

const statusMessages: Record<string, string> = {
  created: "Etiket oluşturuldu.",
  updated: "Etiket güncellendi.",
  deleted: "Etiket silindi ve yazılardan kaldırıldı.",
};

export default async function AdminTagsPage({ searchParams }: PageProps<"/admin/tags">) {
  const denial = await taxonomyAccessDenial();
  if (denial) return denial;

  const [{ status }, tags] = await Promise.all([searchParams, listAdminTags()]);
  const statusMessage = typeof status === "string" ? (statusMessages[status] ?? null) : null;

  return (
    <div className="space-y-8">
      <div className="space-y-2">
        <h1 className="text-3xl font-semibold tracking-tight">Etiketler</h1>
        <p className="text-muted-foreground">
          Bir yazı birden çok etiket taşıyabilir; her etiketin kendi arşivi vardır.
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
            <Tags aria-hidden="true" className="size-5" />
            Tüm etiketler
          </CardTitle>
          <CardDescription>Yazı sayısı taslakları da içerir.</CardDescription>
        </CardHeader>
        <CardContent>
          {tags.length === 0 ? (
            <p className="text-sm text-muted-foreground">Henüz etiket yok.</p>
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
                  <Badge variant="secondary">{tag.postCount} yazı</Badge>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Yeni etiket</CardTitle>
          <CardDescription>
            Ad benzersiz olmalı (büyük/küçük harf fark etmez).
          </CardDescription>
        </CardHeader>
        <CardContent>
          <TaxonomyForm kind="tag" action={createTagAction} submitLabel="Etiket oluştur" />
        </CardContent>
      </Card>
    </div>
  );
}
