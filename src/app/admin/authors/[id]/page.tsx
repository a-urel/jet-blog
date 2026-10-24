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

export const metadata: Metadata = {
  title: "Yazar düzenle",
};

const avatarNotices: Record<string, string> = {
  "avatar-updated": "Yazar fotoğrafı kaydedildi.",
  "avatar-removed": "Yazar fotoğrafı kaldırıldı.",
};

export default async function AdminAuthorPage({
  params,
  searchParams,
}: PageProps<"/admin/authors/[id]">) {
  const denial = await authorAccessDenial();
  if (denial) return denial;

  const [{ id }, { status }] = await Promise.all([params, searchParams]);
  const notice = typeof status === "string" ? avatarNotices[status] : undefined;
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
          <Link href="/admin/authors">← Yazarlar</Link>
        </Button>
        <h1 className="text-3xl font-semibold tracking-tight">{author.name}</h1>
        <p className="text-muted-foreground">{author.creditCount} yazıda kredisi var</p>
      </div>

      {notice ? <StatusNotice>{notice}</StatusNotice> : null}

      <Card>
        <CardHeader>
          <CardTitle>Yazar fotoğrafı</CardTitle>
          <CardDescription>
            Künyelerde ve yazar arşivinde görünür. Bağlı hesabın profil
            fotoğrafından bağımsızdır; değiştirildiğinde veya kaldırıldığında eski
            fotoğraf silinir.
          </CardDescription>
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
                alt={author.avatarId ? `${author.name} fotoğrafı` : "Yazar fotoğrafı yok"}
              />
            }
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Yazarı düzenle</CardTitle>
        </CardHeader>
        <CardContent>
          <AuthorForm
            action={updateAuthorAction}
            submitLabel="Kaydet"
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
          <CardTitle>Yazarı sil</CardTitle>
          <CardDescription>
            {author.creditCount > 0
              ? `Bu yazar ${author.creditCount} yazıda kredilendirilmiş. Silmeden önce yazı düzenleyicide kredilerini kaldırın.`
              : "Bu yazarın hiçbir yazıda kredisi yok. Silinince eski yazar adresleri 404 döner."}
          </CardDescription>
        </CardHeader>
        {author.creditCount === 0 ? (
          <CardContent>
            <DeleteTaxonomyForm
              action={deleteAuthorAction}
              record={record}
              confirmLabel={`"${author.name}" yazarının silineceğini anlıyorum.`}
            />
          </CardContent>
        ) : null}
      </Card>
    </div>
  );
}
