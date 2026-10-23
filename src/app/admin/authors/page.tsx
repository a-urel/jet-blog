import type { Metadata } from "next";
import Link from "next/link";
import { PenLine } from "lucide-react";

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
import { authorAccountChoices } from "@/features/authors/account-choices";
import { createAuthorAction } from "@/features/authors/actions";
import { listAdminAuthors, listAuthorAccountOptions } from "@/features/authors/admin-data";
import { authorAccessDenial } from "@/features/authors/components/author-admin-guard";
import { AuthorForm } from "@/features/authors/components/author-form";

export const metadata: Metadata = {
  title: "Yazarlar",
};

const statusMessages: Record<string, string> = {
  created: "Yazar oluşturuldu.",
  updated: "Yazar güncellendi.",
  deleted: "Yazar silindi.",
};

export default async function AdminAuthorsPage({ searchParams }: PageProps<"/admin/authors">) {
  const denial = await authorAccessDenial();
  if (denial) return denial;

  const [{ status }, authors, accounts] = await Promise.all([
    searchParams,
    listAdminAuthors(),
    listAuthorAccountOptions(),
  ]);
  const statusMessage = typeof status === "string" ? (statusMessages[status] ?? null) : null;
  const accountLabels = new Map(accounts.map((account) => [account.profileId, account.label]));
  const links = authors.map((author) => ({ authorId: author.id, profileId: author.profileId }));

  return (
    <div className="space-y-8">
      <div className="space-y-2">
        <h1 className="text-3xl font-semibold tracking-tight">Yazarlar</h1>
        <p className="text-muted-foreground">
          Yazılarda görünen yazar kimlikleri. Misafir yazarların hesabı yoktur; bir
          kimlik bir editoryal üyeye bağlanabilir.
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
            <PenLine aria-hidden="true" className="size-5" />
            Tüm yazarlar
          </CardTitle>
          <CardDescription>
            Kredi sayısı taslakları da içerir. Yazar sayfası yalnızca yayındaki bir
            yazıda kredisi varsa görünür.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {authors.length === 0 ? (
            <p className="text-sm text-muted-foreground">Henüz yazar yok.</p>
          ) : (
            <ul className="divide-y rounded-lg border">
              {authors.map((author) => (
                <li
                  key={author.id}
                  className="flex flex-wrap items-center justify-between gap-2 px-3 py-2"
                >
                  <div className="min-w-0">
                    <Link
                      href={`/admin/authors/${author.id}`}
                      className="font-medium underline-offset-4 hover:underline"
                    >
                      {author.name}
                    </Link>
                    <p className="truncate text-xs text-muted-foreground">
                      /authors/{author.slug}
                      {author.profileId
                        ? ` · ${accountLabels.get(author.profileId) ?? "Bağlı hesap"}`
                        : " · Misafir"}
                    </p>
                  </div>
                  <Badge variant="secondary">{author.creditCount} yazı</Badge>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Yeni yazar</CardTitle>
          <CardDescription>Slug benzersiz olmalı; ad tekrar edebilir.</CardDescription>
        </CardHeader>
        <CardContent>
          <AuthorForm
            action={createAuthorAction}
            submitLabel="Yazar oluştur"
            accountChoices={authorAccountChoices(accounts, links)}
          />
        </CardContent>
      </Card>
    </div>
  );
}
