import Link from "next/link";

import { Button } from "@/components/ui/button";

// Unknown or inaccessible posts under /admin. RLS hides other authors' drafts,
// so "not found" also covers "not allowed" without revealing which one.
export default function AdminNotFound() {
  return (
    <div className="space-y-4 py-8">
      <p className="text-sm font-medium text-muted-foreground">404</p>
      <h1 className="text-2xl font-semibold">Kayıt bulunamadı</h1>
      <p className="text-muted-foreground">
        Bu kayıt yok veya görüntüleme yetkiniz bulunmuyor.
      </p>
      <Button asChild variant="outline">
        <Link href="/admin/posts">Yazılara dön</Link>
      </Button>
    </div>
  );
}
