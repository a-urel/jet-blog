import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import {
  Files,
  FileText,
  FolderTree,
  Image as ImageIcon,
  LayoutDashboard,
  LogOut,
  Menu,
  MessageSquare,
  PenLine,
  Tags,
  Users,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { LanguageSwitcher } from "@/components/language-switcher";
import { signOutAction } from "@/features/auth/actions";
import { EditorialAccessDenied } from "@/features/auth/components/editorial-access-denied";
import { canManagePages } from "@/features/pages/permissions";
import {
  canManageAuthors,
  canManageMembership,
  canManageTaxonomy,
  canModerateComments,
  getEditorialContext,
} from "@/lib/auth/editorial";
import { adminClientMessages } from "@/i18n/client-messages";
import { ClientMessages } from "@/i18n/client-messages-provider";

export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

export default async function AdminLayout({
  children,
}: LayoutProps<"/[locale]/admin">) {
  const [{ user, membership }, t] = await Promise.all([
    getEditorialContext(),
    getTranslations("admin"),
  ]);

  if (!user) redirect("/login");

  if (!membership) {
    return (
      <EditorialAccessDenied
        title={t("shell.deniedTitle")}
        description={t("shell.deniedDescription")}
        email={user.email}
      />
    );
  }

  // Admin Client Components also need the admin namespaces, which public
  // pages never receive.

  return (
    <ClientMessages paths={adminClientMessages}>
      <div className="mx-auto max-w-6xl px-6 py-10">
        <div className="grid gap-8 md:grid-cols-[14rem_minmax(0,1fr)]">
          <aside className="space-y-6 md:border-r md:pr-6">
            <div className="space-y-2">
              <p className="text-sm font-medium text-muted-foreground">{t("shell.label")}</p>
              <p className="truncate text-sm" title={user.email ?? undefined}>
                {user.email ?? t("shell.missingEmail")}
              </p>
              <Badge variant="secondary">{t(`roles.${membership.role}`)}</Badge>
            </div>

            <nav aria-label={t("shell.navLabel")} className="space-y-1">
              <Link
                href="/admin"
                className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium hover:bg-muted/80"
              >
                <LayoutDashboard aria-hidden="true" className="size-4" />
                {t("shell.nav.overview")}
              </Link>
              <Link
                href="/admin/posts"
                className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium hover:bg-muted/80"
              >
                <FileText aria-hidden="true" className="size-4" />
                {t("shell.nav.posts")}
              </Link>
              <Link
                href="/admin/media"
                className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium hover:bg-muted/80"
              >
                <ImageIcon aria-hidden="true" className="size-4" />
                {t("shell.nav.media")}
              </Link>
              {canModerateComments(membership) ? (
                <Link
                  href="/admin/comments"
                  className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium hover:bg-muted/80"
                >
                  <MessageSquare aria-hidden="true" className="size-4" />
                  {t("shell.nav.comments")}
                </Link>
              ) : null}
              {canManagePages(membership) ? (
                <>
                  <Link
                    href="/admin/pages"
                    className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium hover:bg-muted/80"
                  >
                    <Files aria-hidden="true" className="size-4" />
                    {t("shell.nav.pages")}
                  </Link>
                  <Link
                    href="/admin/navigation"
                    className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium hover:bg-muted/80"
                  >
                    <Menu aria-hidden="true" className="size-4" />
                    {t("shell.nav.navigation")}
                  </Link>
                </>
              ) : null}
              {canManageTaxonomy(membership) ? (
                <>
                  <Link
                    href="/admin/categories"
                    className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium hover:bg-muted/80"
                  >
                    <FolderTree aria-hidden="true" className="size-4" />
                    {t("shell.nav.categories")}
                  </Link>
                  <Link
                    href="/admin/tags"
                    className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium hover:bg-muted/80"
                  >
                    <Tags aria-hidden="true" className="size-4" />
                    {t("shell.nav.tags")}
                  </Link>
                </>
              ) : null}
              {canManageAuthors(membership) ? (
                <Link
                  href="/admin/authors"
                  className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium hover:bg-muted/80"
                >
                  <PenLine aria-hidden="true" className="size-4" />
                  {t("shell.nav.authors")}
                </Link>
              ) : null}
              {canManageMembership(membership) ? (
                <Link
                  href="/admin/members"
                  className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium hover:bg-muted/80"
                >
                  <Users aria-hidden="true" className="size-4" />
                  {t("shell.nav.members")}
                </Link>
              ) : null}
            </nav>

            <div className="space-y-3 border-t pt-4">
              <LanguageSwitcher align="start" />
              <form action={signOutAction}>
                <Button type="submit" variant="outline" size="sm" className="w-full">
                  <LogOut aria-hidden="true" />
                  {t("shell.signOut")}
                </Button>
              </form>
              <Button asChild variant="ghost" size="sm" className="w-full">
                <Link href="/">{t("shell.backToSite")}</Link>
              </Button>
            </div>
          </aside>

          <div className="min-w-0">{children}</div>
        </div>
      </div>
    </ClientMessages>
  );
}
