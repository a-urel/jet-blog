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
import { authorAccountChoices } from "@/features/authors/account-choices";
import {
  deleteAuthorAction,
  removeAuthorAvatarAction,
  updateAuthorAction,
  updateAuthorAvatarAction,
} from "@/features/authors/actions";
import { listAdminAuthors, listAuthorAccountOptions } from "@/features/authors/admin-data";
import { authorAccessDenial } from "@/features/authors/components/author-admin-guard";
import { AuthorForm } from "@/features/authors/components/author-form";
import { StatusNotice } from "@/features/auth/components/auth-page-shell";
import { AvatarForm } from "@/features/avatars/components/avatar-form";
import { IdentityAvatar } from "@/features/avatars/components/identity-avatar";
import { isUuid } from "@/features/posts/admin/validation";
import { DeleteTaxonomyForm } from "@/features/taxonomy/components/delete-taxonomy-form";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("adminAuthors.author");
  return { title: t("metaTitle") };
}

const avatarNotices = {
  "avatar-updated": "avatarUpdated",
  "avatar-removed": "avatarRemoved",
} as const;

function isAvatarNotice(value: unknown): value is keyof typeof avatarNotices {
  return typeof value === "string" && Object.hasOwn(avatarNotices, value);
}

export default async function AdminAuthorPage({
  params,
  searchParams,
}: PageProps<"/[locale]/admin/authors/[id]">) {
  const denial = await authorAccessDenial();
  if (denial) return denial;

  const [{ id }, { status }, t, tForm] = await Promise.all([
    params,
    searchParams,
    getTranslations("adminAuthors.author"),
    getTranslations("admin.form"),
  ]);
  const notice = isAvatarNotice(status) ? t(`status.${avatarNotices[status]}`) : undefined;
  if (!isUuid(id)) notFound();

  const [authors, accounts] = await Promise.all([listAdminAuthors(), listAuthorAccountOptions()]);
  const author = authors.find((candidate) => candidate.id === id);
  if (!author) notFound();

  const record = { id: author.id, updatedAt: author.updatedAt };
  const links = authors.map((candidate) => ({
    authorId: candidate.id,
    profileId: candidate.profileId,
  }));

  return (
    <div className="space-y-8">
      <div className="space-y-2">
        <Button asChild variant="ghost" size="sm" className="-ml-3">
          <Link href="/admin/authors">{t("back")}</Link>
        </Button>
        <h1 className="text-3xl font-semibold tracking-tight">{author.name}</h1>
        <p className="text-muted-foreground">
          {t("credits", { count: author.creditCount })}
        </p>
      </div>

      {notice ? <StatusNotice>{notice}</StatusNotice> : null}

      <Card>
        <CardHeader>
          <CardTitle>{t("avatarTitle")}</CardTitle>
          <CardDescription>{t("avatarDescription")}</CardDescription>
        </CardHeader>
        <CardContent>
          <AvatarForm
            idPrefix={`author-${author.id}`}
            hasAvatar={author.avatarId !== null}
            uploadAction={updateAuthorAvatarAction}
            removeAction={removeAuthorAvatarAction}
            hiddenFields={record}
            preview={
              <IdentityAvatar
                kind="authors"
                avatarId={author.avatarId}
                name={author.name}
                size="xl"
                alt={author.avatarId ? t("avatarAlt", { name: author.name }) : t("avatarNone")}
              />
            }
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t("editTitle")}</CardTitle>
        </CardHeader>
        <CardContent>
          <AuthorForm
            action={updateAuthorAction}
            submitLabel={tForm("save")}
            record={record}
            initialValues={{
              name: author.name,
              slug: author.slug,
              bio: author.bio ?? "",
              profileId: author.profileId ?? "",
            }}
            accountChoices={authorAccountChoices(accounts, links, author.id)}
          />
        </CardContent>
      </Card>

      <Card className="border-destructive/40">
        <CardHeader>
          <CardTitle>{t("deleteTitle")}</CardTitle>
          <CardDescription>
            {author.creditCount > 0
              ? t("deleteCredited", { count: author.creditCount })
              : t("deleteUncredited")}
          </CardDescription>
        </CardHeader>
        {author.creditCount === 0 ? (
          <CardContent>
            <DeleteTaxonomyForm
              action={deleteAuthorAction}
              record={record}
              confirmLabel={t("confirm", { name: author.name })}
            />
          </CardContent>
        ) : null}
      </Card>
    </div>
  );
}
