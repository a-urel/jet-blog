import type { Metadata } from "next";
import Link from "next/link";
import { FileText, ShieldCheck, Users } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  canManageMembership,
  getEditorialContext,
  type EditorialRole,
} from "@/lib/auth/editorial";

export const metadata: Metadata = {
  title: "Genel bakış",
};

const roleLabels: Record<EditorialRole, string> = {
  admin: "Admin",
  editor: "Editör",
  author: "Yazar",
};

const roleDescriptions: Record<EditorialRole, string> = {
  admin:
    "Üyeleri yönetebilir, rol verebilir ve içerik yetkilerinin tamamına sahipsiniz.",
  editor:
    "Her yazıyı oluşturup düzenleyebilir ve yayınlayabilirsiniz. Üye yönetimi admin yetkisindedir.",
  author:
    "Kendi taslaklarınızı oluşturup düzenleyebilirsiniz. Yayınlama ve üye yönetimi diğer rollerdedir.",
};

export default async function AdminPage() {
  const { membership } = await getEditorialContext();

  if (!membership) return null;

  return (
    <div className="space-y-8">
      <div className="space-y-2">
        <h1 className="text-3xl font-semibold tracking-tight">Genel bakış</h1>
        <p className="text-muted-foreground">
          Oturumunuz ve editöryal üyeliğiniz sunucuda doğrulandı.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ShieldCheck aria-hidden="true" className="size-5" />
            Rolünüz: {roleLabels[membership.role]}
            <Badge variant="secondary">{roleLabels[membership.role]}</Badge>
          </CardTitle>
          <CardDescription>{roleDescriptions[membership.role]}</CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            Taslak oluşturma, metadata düzenleme, kategori, etiket ve sıralı
            yazar kredileri hazırdır. Gövde editörü, medya ve yayınlama sonraki
            fazlarda eklenecek.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileText aria-hidden="true" className="size-5" />
            İçerik
          </CardTitle>
          <CardDescription>
            Taslak oluşturun, metadata bilgilerini düzenleyin veya üyelere özel
            önizlemeyi açın.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button asChild>
            <Link href="/admin/posts">Yazıları aç</Link>
          </Button>
        </CardContent>
      </Card>

      {canManageMembership(membership) ? (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Users aria-hidden="true" className="size-5" />
              Üye yönetimi
            </CardTitle>
            <CardDescription>
              Editöryal üyeleri davet edin, rollerini değiştirin veya
              deaktive edin.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild>
              <Link href="/admin/members">Üyeleri yönet</Link>
            </Button>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
