import type { Metadata } from "next";
import Link from "next/link";
import { FileText, ShieldCheck, Users } from "lucide-react";
import { getTranslations } from "next-intl/server";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { canManageMembership, getEditorialContext } from "@/lib/auth/editorial";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("admin.dashboard");
  return { title: t("title") };
}

export default async function AdminPage() {
  const [{ membership }, t] = await Promise.all([
    getEditorialContext(),
    getTranslations("admin"),
  ]);

  if (!membership) return null;

  const roleLabel = t(`roles.${membership.role}`);

  return (
    <div className="space-y-8">
      <div className="space-y-2">
        <h1 className="text-3xl font-semibold tracking-tight">{t("dashboard.title")}</h1>
        <p className="text-muted-foreground">{t("dashboard.intro")}</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ShieldCheck aria-hidden="true" className="size-5" />
            {t("dashboard.yourRole", { role: roleLabel })}
            <Badge variant="secondary">{roleLabel}</Badge>
          </CardTitle>
          <CardDescription>
            {t(`dashboard.roleDescriptions.${membership.role}`)}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">{t("dashboard.features")}</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileText aria-hidden="true" className="size-5" />
            {t("dashboard.contentTitle")}
          </CardTitle>
          <CardDescription>{t("dashboard.contentDescription")}</CardDescription>
        </CardHeader>
        <CardContent>
          <Button asChild>
            <Link href="/admin/posts">{t("dashboard.openPosts")}</Link>
          </Button>
        </CardContent>
      </Card>

      {canManageMembership(membership) ? (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Users aria-hidden="true" className="size-5" />
              {t("dashboard.membersTitle")}
            </CardTitle>
            <CardDescription>{t("dashboard.membersDescription")}</CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild>
              <Link href="/admin/members">{t("dashboard.manageMembers")}</Link>
            </Button>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
