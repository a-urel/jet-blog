import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { FileText, LayoutDashboard, LogOut, Users } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { signOutAction } from "@/features/auth/actions";
import { EditorialAccessDenied } from "@/features/auth/components/editorial-access-denied";
import {
  canManageMembership,
  getEditorialContext,
  type EditorialRole,
} from "@/lib/auth/editorial";

export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

const roleLabels: Record<EditorialRole, string> = {
  admin: "Admin",
  editor: "Editör",
  author: "Yazar",
};

export default async function AdminLayout({
  children,
}: LayoutProps<"/admin">) {
  const { user, membership } = await getEditorialContext();

  if (!user) redirect("/login");

  if (!membership) {
    return (
      <EditorialAccessDenied
        title="Yönetim erişimi yok"
        description="Bu alan yalnızca davet edilen editöryal üyelere açıktır. Erişim için bir yöneticiden davet isteyin."
        email={user.email}
      />
    );
  }

  return (
    <div className="mx-auto max-w-6xl px-6 py-10">
      <div className="grid gap-8 md:grid-cols-[14rem_minmax(0,1fr)]">
        <aside className="space-y-6 md:border-r md:pr-6">
          <div className="space-y-2">
            <p className="text-sm font-medium text-muted-foreground">Yönetim</p>
            <p className="truncate text-sm" title={user.email ?? undefined}>
              {user.email ?? "E-posta bilgisi yok"}
            </p>
            <Badge variant="secondary">{roleLabels[membership.role]}</Badge>
          </div>

          <nav aria-label="Yönetim menüsü" className="space-y-1">
            <Link
              href="/admin"
              className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium hover:bg-muted/80"
            >
              <LayoutDashboard aria-hidden="true" className="size-4" />
              Genel bakış
            </Link>
            <Link
              href="/admin/posts"
              className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium hover:bg-muted/80"
            >
              <FileText aria-hidden="true" className="size-4" />
              Yazılar
            </Link>
            {canManageMembership(membership) ? (
              <Link
                href="/admin/members"
                className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium hover:bg-muted/80"
              >
                <Users aria-hidden="true" className="size-4" />
                Üyeler
              </Link>
            ) : null}
          </nav>

          <div className="space-y-3 border-t pt-4">
            <form action={signOutAction}>
              <Button type="submit" variant="outline" size="sm" className="w-full">
                <LogOut aria-hidden="true" />
                Çıkış yap
              </Button>
            </form>
            <Button asChild variant="ghost" size="sm" className="w-full">
              <Link href="/">Siteye dön</Link>
            </Button>
          </div>
        </aside>

        <div className="min-w-0">{children}</div>
      </div>
    </div>
  );
}
