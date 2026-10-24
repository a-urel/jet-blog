import type { Metadata } from "next";
import Link from "next/link";
import { PenLine } from "lucide-react";
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
import { authorAccountChoices } from "@/features/authors/account-choices";
import { createAuthorAction } from "@/features/authors/actions";
import { listAdminAuthors, listAuthorAccountOptions } from "@/features/authors/admin-data";
import { authorAccessDenial } from "@/features/authors/components/author-admin-guard";
import { AuthorForm } from "@/features/authors/components/author-form";
import { IdentityAvatar } from "@/features/avatars/components/identity-avatar";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("adminAuthors.list");
  return { title: t("title") };
}

const statuses = ["created", "updated", "deleted"] as const;

function isStatus(value: unknown): value is (typeof statuses)[number] {
  return statuses.includes(value as (typeof statuses)[number]);
}

export default async function AdminAuthorsPage({ searchParams }: PageProps<"/[locale]/admin/authors">) {
  const denial = await authorAccessDenial();
  if (denial) return denial;

  const [{ status }, authors, accounts, t] = await Promise.all([
    searchParams,
    listAdminAuthors(),
    listAuthorAccountOptions(),
    getTranslations("adminAuthors.list"),
  ]);
  const statusMessage = isStatus(status) ? t(`status.${status}`) : null;
  const accountLabels = new Map(accounts.map((account) => [account.profileId, account.label]));
  const links = authors.map((author) => ({ authorId: author.id, profileId: author.profileId }));

  return (
    <div className="space-y-8">
      <div className="space-y-2">
        <h1 className="text-3xl font-semibold tracking-tight">{t("title")}</h1>
        <p className="text-muted-foreground">{t("intro")}</p>
      </div>

      {statusMessage ? <QueryStatusToast message={statusMessage} /> : null}

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <PenLine aria-hidden="true" className="size-5" />
            {t("listTitle")}
          </CardTitle>
          <CardDescription>{t("listDescription")}</CardDescription>
        </CardHeader>
        <CardContent>
          {authors.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("empty")}</p>
          ) : (
            <ul className="divide-y rounded-lg border">
              {authors.map((author) => (
                <li
                  key={author.id}
                  className="flex flex-wrap items-center justify-between gap-2 px-3 py-2"
                >
                  <div className="flex min-w-0 items-center gap-3">
                    <IdentityAvatar
                      kind="authors"
                      avatarId={author.avatarId}
                      name={author.name}
                    />
                    <div className="min-w-0">
                      <Link
                        href={`/admin/authors/${author.id}`}
                        className="font-medium underline-offset-4 hover:underline"
                      >
                        {author.name}
                      </Link>
                      <p className="truncate text-xs text-muted-foreground">
                        /authors/{author.slug}
                        {" · "}
                        {author.profileId
                          ? (accountLabels.get(author.profileId) ?? t("linkedAccount"))
                          : t("guest")}
                      </p>
                    </div>
                  </div>
                  <Badge variant="secondary">{t("creditCount", { count: author.creditCount })}</Badge>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t("newTitle")}</CardTitle>
          <CardDescription>{t("newDescription")}</CardDescription>
        </CardHeader>
        <CardContent>
          <AuthorForm
            action={createAuthorAction}
            submitLabel={t("create")}
            accountChoices={authorAccountChoices(accounts, links)}
          />
        </CardContent>
      </Card>
    </div>
  );
}
