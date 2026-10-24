import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  AuthPageShell,
  SupabaseNotConfigured,
} from "@/features/auth/components/auth-page-shell";
import { UpdatePasswordForm } from "@/features/auth/components/update-password-form";
import { getSessionUser } from "@/lib/auth/session";
import { isSupabaseConfigured } from "@/lib/supabase/env";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("account.passwordPage");
  return { title: t("title") };
}

export default async function AccountPasswordPage({
  searchParams,
}: PageProps<"/[locale]/account/password">) {
  const [t, tAuth] = await Promise.all([
    getTranslations("account.passwordPage"),
    getTranslations("auth"),
  ]);

  if (!isSupabaseConfigured()) {
    return (
      <AuthPageShell eyebrow={tAuth("eyebrow.account")} title={t("title")}>
        <SupabaseNotConfigured action={t("notConfiguredAction")} />
      </AuthPageShell>
    );
  }

  const user = await getSessionUser();
  if (!user) redirect("/login/reset");

  const { recovery } = await searchParams;

  return (
    <AuthPageShell
      eyebrow={tAuth("eyebrow.account")}
      title={recovery === "1" ? t("recoveryTitle") : t("title")}
      description={recovery === "1" ? t("recoveryDescription") : undefined}
    >
      <Card>
        <CardHeader>
          <CardTitle>{t("cardTitle")}</CardTitle>
          <CardDescription>{tAuth("passwordForm.managerHint")}</CardDescription>
        </CardHeader>
        <CardContent>
          <UpdatePasswordForm />
        </CardContent>
      </Card>

      <p className="text-sm text-muted-foreground">
        <Link href="/account" className="font-medium text-foreground underline underline-offset-4">
          {t("back")}
        </Link>
      </p>
    </AuthPageShell>
  );
}
