import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CircleAlert, Eye, FileText, LockKeyhole } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { PostForm } from "@/features/posts/admin/components/post-form";
import {
  getAdminPostDetail,
  listTaxonomyOptions,
} from "@/features/posts/admin/data";
import { canEditPost } from "@/features/posts/admin/permissions";
import {
  currentContentVersion,
  validateBodyDocument,
} from "@/features/posts/content/schema";
import { getEditorialContext } from "@/lib/auth/editorial";

export const metadata: Metadata = {
  title: "Yazıyı düzenle",
};

const dateFormatter = new Intl.DateTimeFormat("tr-TR", {
  dateStyle: "medium",
  timeStyle: "short",
});

const successMessages: Record<string, string> = {
  olusturuldu: "Taslak oluşturuldu.",
  guncellendi: "Değişiklikler kaydedildi.",
};

export default async function EditPostPage({
  params,
  searchParams,
}: PageProps<"/admin/posts/[id]">) {
  const { id } = await params;
  const { user, membership } = await getEditorialContext();

  if (!user || !membership) return null;

  const [{ post, error }, taxonomy] = await Promise.all([
    getAdminPostDetail(id),
    listTaxonomyOptions(),
  ]);

  if (error) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CircleAlert aria-hidden="true" className="size-5" />
            Yazı yüklenemedi
          </CardTitle>
          <CardDescription>
            Kayıt alınamadı. Sayfayı yenileyip tekrar deneyin.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button asChild variant="outline">
            <Link href="/admin/posts">Yazılara dön</Link>
          </Button>
        </CardContent>
      </Card>
    );
  }

  if (!post) notFound();

  const editable = canEditPost(post, membership, user.id);
  const bodyValidation =
    post.contentVersion === currentContentVersion
      ? validateBodyDocument(post.body)
      : null;
  const editableBody = bodyValidation?.ok ? bodyValidation.doc : null;
  const { durum } = await searchParams;
  const successMessage =
    typeof durum === "string" ? (successMessages[durum] ?? null) : null;
  const previewHref = `/admin/posts/${post.id}/onizleme`;

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <p className="text-sm text-muted-foreground">
          <Link href="/admin/posts" className="underline-offset-4 hover:underline">
            Yazılar
          </Link>{" "}
          / {post.title}
        </p>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="space-y-2">
            <h1 className="flex flex-wrap items-center gap-3 text-3xl font-semibold tracking-tight">
              <FileText aria-hidden="true" className="size-7" />
              {post.title}
              <Badge variant={post.status === "published" ? "default" : "secondary"}>
                {post.status === "published" ? "Yayında" : "Taslak"}
              </Badge>
            </h1>
            <p className="text-sm text-muted-foreground">
              Sürüm {post.revision} · Son güncelleme{" "}
              {dateFormatter.format(new Date(post.updatedAt))}
            </p>
          </div>
          <Button asChild variant="outline">
            <Link href={previewHref}>
              <Eye aria-hidden="true" />
              Üye önizlemesi
            </Link>
          </Button>
        </div>
      </div>

      {successMessage ? (
        <p
          role="status"
          className="rounded-lg border border-emerald-600/30 bg-emerald-600/10 px-3 py-2 text-sm text-emerald-800 dark:text-emerald-300"
        >
          {successMessage}
        </p>
      ) : null}

      {!editable ? (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <LockKeyhole aria-hidden="true" className="size-5" />
              Salt okunur
            </CardTitle>
            <CardDescription>
              Yayınlanmış bir yazıyı yalnızca editörler ve adminler
              düzenleyebilir. Yazar kredisi düzenleme yetkisi vermez.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild variant="outline">
              <Link href={previewHref}>Üye önizlemesini aç</Link>
            </Button>
          </CardContent>
        </Card>
      ) : !editableBody ? (
        // Opening an unsupported document in the editor would drop the content
        // it cannot represent on the next save, so the form stays closed.
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CircleAlert aria-hidden="true" className="size-5" />
              İçerik sürümü desteklenmiyor
            </CardTitle>
            <CardDescription>
              Bu yazının gövdesi bu editör sürümünün desteklemediği bir biçimde
              kaydedilmiş (sürüm {post.contentVersion}). Veri kaybını önlemek
              için düzenleme kapalı.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild variant="outline">
              <Link href={previewHref}>Üye önizlemesini aç</Link>
            </Button>
          </CardContent>
        </Card>
      ) : taxonomy.error ? (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CircleAlert aria-hidden="true" className="size-5" />
              Seçenekler yüklenemedi
            </CardTitle>
            <CardDescription>
              Kategori, etiket ve yazar listesi alınamadı. Sayfayı yenileyip
              tekrar deneyin.
            </CardDescription>
          </CardHeader>
        </Card>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>Yazı bilgileri</CardTitle>
            <CardDescription>
              Değişiklikleri kaydettiğinizde sürüm numarası artar. Form açıkken
              başka bir düzenleme yapıldıysa kayıt sessizce üzerine yazmaz.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <PostForm
              mode="edit"
              postId={post.id}
              revision={post.revision}
              categories={taxonomy.categories}
              tags={taxonomy.tags}
              authors={taxonomy.authors}
              initialValues={{
                title: post.title,
                slug: post.slug,
                excerpt: post.excerpt ?? "",
                categoryId: post.categoryId ?? "",
                tagIds: post.tagIds,
                credits: post.credits.map((credit) => ({
                  authorId: credit.authorId,
                  authorName: credit.authorName,
                })),
                body: editableBody,
              }}
            />
          </CardContent>
        </Card>
      )}
    </div>
  );
}
