import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, CircleAlert, Eye, Pencil } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { getAdminPostDetail } from "@/features/posts/admin/data";
import { canEditPost } from "@/features/posts/admin/permissions";
import { getEditorialContext } from "@/lib/auth/editorial";

export const metadata: Metadata = {
  title: "Yazı önizlemesi",
  robots: { index: false, follow: false },
};

// Preview reads a draft through the caller's session and must never be served
// from a public cache.
export const dynamic = "force-dynamic";

export default async function PostPreviewPage({
  params,
}: PageProps<"/admin/posts/[id]/onizleme">) {
  const { id } = await params;
  const { user, membership } = await getEditorialContext();

  if (!user || !membership) return null;

  const { post, error } = await getAdminPostDetail(id);

  if (error) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CircleAlert aria-hidden="true" className="size-5" />
            Önizleme yüklenemedi
          </CardTitle>
          <CardDescription>
            Kayıt alınamadı. Sayfayı yenileyip tekrar deneyin.
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  if (!post) notFound();

  const editable = canEditPost(post, membership, user.id);

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Button asChild variant="ghost" size="sm">
          <Link href="/admin/posts">
            <ArrowLeft aria-hidden="true" />
            Yazılara dön
          </Link>
        </Button>
        <div className="flex items-center gap-2">
          <Badge variant="outline">
            <Eye aria-hidden="true" />
            Üyelere özel önizleme
          </Badge>
          {editable ? (
            <Button asChild variant="outline" size="sm">
              <Link href={`/admin/posts/${post.id}`}>
                <Pencil aria-hidden="true" />
                Düzenle
              </Link>
            </Button>
          ) : null}
        </div>
      </div>

      {post.status === "draft" ? (
        <p className="rounded-lg border border-amber-600/40 bg-amber-600/10 px-3 py-2 text-sm text-amber-900 dark:text-amber-200">
          Bu taslak yalnızca editöryal üyelere görünür. Genel site, arama ve
          önbellekler bu içeriği göstermez.
        </p>
      ) : null}

      <article className="mx-auto max-w-3xl space-y-8">
        <header className="space-y-5 border-b pb-8">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant={post.status === "published" ? "default" : "secondary"}>
              {post.status === "published" ? "Yayında" : "Taslak"}
            </Badge>
            {post.categoryName ? (
              <Badge variant="outline">{post.categoryName}</Badge>
            ) : (
              <Badge variant="outline">Kategori yok</Badge>
            )}
            {post.tagNames.map((tag) => (
              <Badge key={tag} variant="secondary">
                {tag}
              </Badge>
            ))}
          </div>
          <h1 className="text-3xl leading-tight font-semibold tracking-tight sm:text-5xl">
            {post.title}
          </h1>
          {post.excerpt ? (
            <p className="text-lg leading-relaxed text-muted-foreground">
              {post.excerpt}
            </p>
          ) : null}
          <div className="space-y-1 text-sm">
            <p className="font-medium">Yazarlar</p>
            {post.credits.length > 0 ? (
              <ol className="space-y-1 text-muted-foreground">
                {post.credits.map((credit) => (
                  <li key={credit.authorId}>
                    {credit.sortOrder + 1}. {credit.authorName}
                  </li>
                ))}
              </ol>
            ) : (
              <p className="text-muted-foreground">Yazar eklenmedi.</p>
            )}
          </div>
          <p className="text-sm text-muted-foreground">
            Sürüm {post.revision} · /{post.slug}
          </p>
        </header>

        <div className="rounded-lg border border-dashed px-4 py-6 text-sm text-muted-foreground">
          Yazı gövdesi Phase 5&apos;te Tiptap editörüyle eklenecek. Bu önizleme
          metadata, kategori, etiket ve sıralı yazar kredilerini doğrular.
        </div>
      </article>
    </div>
  );
}
