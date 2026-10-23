import type { Metadata } from "next";
import Image from "next/image";
import { CircleAlert, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { deleteMediaAction } from "@/features/media/actions";
import { listMedia } from "@/features/media/data";
import { mediaPublicUrl } from "@/features/media/url";
import { getEditorialContext } from "@/lib/auth/editorial";

export const metadata: Metadata = {
  title: "Medya",
};

const dateFormatter = new Intl.DateTimeFormat("tr-TR", {
  dateStyle: "medium",
  timeStyle: "short",
});

const sizeFormatter = new Intl.NumberFormat("tr-TR", {
  maximumFractionDigits: 1,
});

const successMessages: Record<string, string> = {
  deleted: "Görsel silindi.",
};

const errorMessages: Record<string, string> = {
  invalid: "Geçersiz istek.",
  forbidden: "Bu görseli silme yetkiniz yok.",
  "not-found": "Görsel bulunamadı.",
  "in-use": "Bu görsel bir yazıda kullanıldığı için silinemez. Önce yazılardan kaldırın.",
  "object-remains":
    "Görsel kaydı silindi ancak dosya Storage'dan kaldırılamadı. Tekrar deneyin veya bir yöneticiye bildirin.",
  "rate-limited":
    "Kısa sürede çok fazla görsel silindi (10 dakikada en fazla 60). Biraz sonra tekrar deneyin.",
  failed: "İşlem tamamlanamadı. Tekrar deneyin.",
};

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${sizeFormatter.format(bytes / 1024)} KB`;
  return `${sizeFormatter.format(bytes / 1024 / 1024)} MB`;
}

export default async function AdminMediaPage({
  searchParams,
}: PageProps<"/admin/media">) {
  const { user, membership } = await getEditorialContext();

  if (!user || !membership) return null;

  const { status, error: errorParam } = await searchParams;
  const successMessage =
    typeof status === "string" ? (successMessages[status] ?? null) : null;
  const errorMessage =
    typeof errorParam === "string" ? (errorMessages[errorParam] ?? null) : null;
  const canDeleteAny = membership.role === "admin" || membership.role === "editor";
  const { media, error } = await listMedia();

  return (
    <div className="space-y-8">
      <div className="space-y-2">
        <h1 className="text-3xl font-semibold tracking-tight">Medya</h1>
        <p className="text-muted-foreground">
          Yazı editöründen yüklenen görseller. Bir yazıda kullanılan görsel
          silinemez.
        </p>
      </div>

      {successMessage ? (
        <p
          role="status"
          className="rounded-lg border border-emerald-600/30 bg-emerald-600/10 px-3 py-2 text-sm text-emerald-800 dark:text-emerald-300"
        >
          {successMessage}
        </p>
      ) : null}

      {errorMessage || error ? (
        <p
          role="alert"
          className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive"
        >
          <CircleAlert aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
          {errorMessage ?? "Medya listesi yüklenemedi."}
        </p>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Görseller</CardTitle>
          <CardDescription>
            Bucket herkese açıktır: dosya adresini bilen herkes görseli
            açabilir, taslakta kullanılan görseller dahil. Yazarlar yalnızca
            kendi yüklediklerini, editörler ve adminler tüm kullanılmayan
            görselleri silebilir.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {!error && media.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Henüz yüklenmiş görsel yok.
            </p>
          ) : null}

          {media.length > 0 ? (
            <ul className="divide-y">
              {media.map((item) => {
                const src = mediaPublicUrl(item.id);
                const canDelete = canDeleteAny || item.uploadedBy === user.id;

                return (
                  <li
                    key={item.id}
                    className="flex flex-wrap items-center gap-4 py-3"
                  >
                    {src ? (
                      <Image
                        src={src}
                        alt=""
                        width={item.width}
                        height={item.height}
                        sizes="6rem"
                        className="h-16 w-24 rounded-md border bg-muted object-cover"
                      />
                    ) : null}
                    <div className="min-w-0 flex-1 space-y-1 text-sm">
                      <p className="truncate font-mono text-xs">{item.id}</p>
                      <p className="text-muted-foreground">
                        {item.mimeType} · {item.width}×{item.height} ·{" "}
                        {formatSize(item.sizeBytes)} ·{" "}
                        {dateFormatter.format(new Date(item.createdAt))}
                      </p>
                    </div>
                    {canDelete ? (
                      <form action={deleteMediaAction}>
                        <input type="hidden" name="mediaId" value={item.id} />
                        <Button type="submit" variant="outline" size="sm">
                          <Trash2 aria-hidden="true" />
                          Sil
                        </Button>
                      </form>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}
