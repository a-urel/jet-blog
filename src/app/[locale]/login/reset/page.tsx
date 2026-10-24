import type { Metadata } from "next";
import Link from "next/link";
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
  StatusNotice,
  SupabaseNotConfigured,
} from "@/features/auth/components/auth-page-shell";
import { PasswordResetRequestForm } from "@/features/auth/components/password-reset-request-form";
import { isSupabaseConfigured } from "@/lib/supabase/env";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("auth.passwordReset");
  return {
    title: t("title"),
    robots: { index: false, follow: false },
  };
}

export default async function PasswordResetPage({
  searchParams,
}: PageProps<"/[locale]/login/reset">) {
  const { link } = await searchParams;
  const t = await getTranslations("auth");

  if (!isSupabaseConfigured()) {
    return (
      <AuthPageShell eyebrow={t("eyebrow.account")} title={t("passwordReset.title")}>
        <SupabaseNotConfigured action={t("passwordReset.notConfiguredAction")} />
      </AuthPageShell>
    );
  }

  return (
    <AuthPageShell
      eyebrow={t("eyebrow.account")}
      title={t("passwordReset.title")}
      description={t("passwordReset.description")}
    >
      {link === "invalid" ? (
        <StatusNotice>{t("passwordReset.invalidLink")}</StatusNotice>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>{t("passwordReset.cardTitle")}</CardTitle>
          <CardDescription>{t("passwordReset.cardDescription")}</CardDescription>
        </CardHeader>
        <CardContent>
          <PasswordResetRequestForm />
        </CardContent>
      </Card>

      <p className="text-sm text-muted-foreground">
        <Link href="/login" className="font-medium text-foreground underline underline-offset-4">
          {t("passwordReset.backToSignIn")}
        </Link>
      </p>
    </AuthPageShell>
  );
}
