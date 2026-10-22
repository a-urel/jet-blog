import type { Metadata } from "next";
import Link from "next/link";
import { CircleAlert, Eye, FilePlus2, Pencil } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { listAdminPosts } from "@/features/posts/admin/data";
import { canEditPost } from "@/features/posts/admin/permissions";
import { getEditorialContext } from "@/lib/auth/editorial";

export const metadata: Metadata = {
  title: "Yazılar",
};

const dateFormatter = new Intl.DateTimeFormat("tr-TR", {
  dateStyle: "medium",
  timeStyle: "short",
});

export default async function AdminPostsPage() {
  const { user, membership } = await getEditorialContext();

  if (!user || !membership) return null;

  const { posts, error } = await listAdminPosts();

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-2">
          <h1 className="text-3xl font-semibold tracking-tight">Yazılar</h1>
          <p className="text-muted-foreground">
            Taslak oluşturun ve metadata bilgilerini yönetin. Gövde editörü ve
            yayınlama sonraki fazlarda eklenecek.
          </p>
        </div>
        <Button asChild>
          <Link href="/admin/posts/new">
            <FilePlus2 aria-hidden="true" />
            Yeni taslak
          </Link>
        </Button>
      </div>

      {error ? (
        <p
          role="alert"
          className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive"
        >
          <CircleAlert aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
          Yazı listesi yüklenemedi. Bağlantıyı ve veritabanı erişimini kontrol
          edin.
        </p>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>İçerik listesi</CardTitle>
          <CardDescription>
            Yalnızca erişebildiğiniz yazılar gösterilir. Yazarlar kendi
            taslaklarını, editörler ve adminler tüm yazıları görür.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {!error && posts.length === 0 ? (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">
                Henüz erişebildiğiniz bir yazı yok.
              </p>
              <Button asChild variant="outline" size="sm">
                <Link href="/admin/posts/new">İlk taslağı oluştur</Link>
              </Button>
            </div>
          ) : null}

          {!error && posts.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[52rem] border-collapse text-sm">
                <thead>
                  <tr className="border-b text-left text-muted-foreground">
                    <th className="py-2 pr-4 font-medium">Başlık</th>
                    <th className="py-2 pr-4 font-medium">Durum</th>
                    <th className="py-2 pr-4 font-medium">Kategori</th>
                    <th className="py-2 pr-4 font-medium">Yazarlar</th>
                    <th className="py-2 pr-4 font-medium">Güncelleme</th>
                    <th className="py-2 font-medium">İşlem</th>
                  </tr>
                </thead>
                <tbody>
                  {posts.map((post) => {
                    const editable = canEditPost(
                      post,
                      membership,
                      user.id,
                    );

                    return (
                      <tr
                        key={post.id}
                        className="border-b align-top last:border-b-0"
                      >
                        <td className="py-3 pr-4">
                          <p className="font-medium">{post.title}</p>
                          <p className="text-muted-foreground">/{post.slug}</p>
                        </td>
                        <td className="py-3 pr-4">
                          <Badge
                            variant={
                              post.status === "published"
                                ? "default"
                                : "secondary"
                            }
                          >
                            {post.status === "published"
                              ? "Yayında"
                              : "Taslak"}
                          </Badge>
                        </td>
                        <td className="py-3 pr-4">
                          {post.categoryName ?? (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </td>
                        <td className="py-3 pr-4">
                          {post.authorNames.length > 0
                            ? post.authorNames.join(", ")
                            : "Yazar yok"}
                        </td>
                        <td className="py-3 pr-4 text-muted-foreground">
                          {dateFormatter.format(new Date(post.updatedAt))}
                        </td>
                        <td className="py-3">
                          <div className="flex flex-wrap items-center gap-2">
                            {editable ? (
                              <Button asChild variant="outline" size="sm">
                                <Link href={`/admin/posts/${post.id}`}>
                                  <Pencil aria-hidden="true" />
                                  Düzenle
                                </Link>
                              </Button>
                            ) : null}
                            <Button asChild variant="ghost" size="sm">
                              <Link href={`/admin/posts/${post.id}/preview`}>
                                <Eye aria-hidden="true" />
                                Önizle
                              </Link>
                            </Button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : null}
        </CardContent>
      </Card>

      <p className="text-sm text-muted-foreground">
        Kategori, etiket ve yazar profilleri bu artışta yalnızca mevcut
        kayıtlardan seçilir. Yönetim ekranları ayrı bir sonraki artışta ele
        alınacak.
      </p>
    </div>
  );
}
