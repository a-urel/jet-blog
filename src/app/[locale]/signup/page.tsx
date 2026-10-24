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
import { SignUpForm } from "@/features/auth/components/sign-up-form";
import { getSessionUser } from "@/lib/auth/session";
import { isSupabaseConfigured } from "@/lib/supabase/env";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("auth.signUp");
  return {
    title: t("title"),
    robots: { index: false, follow: false },
  };
}

export default async function SignUpPage() {
  const t = await getTranslations("auth");

  if (!isSupabaseConfigured()) {
    return (
      <AuthPageShell eyebrow={t("eyebrow.reader")} title={t("signUp.title")}>
        <SupabaseNotConfigured action={t("signUp.notConfiguredAction")} />
      </AuthPageShell>
    );
  }

  if (await getSessionUser()) redirect("/account");

  return (
    <AuthPageShell
      eyebrow={t("eyebrow.reader")}
      title={t("signUp.title")}
      description={t("signUp.description")}
    >
      <Card>
        <CardHeader>
          <CardTitle>{t("signUp.cardTitle")}</CardTitle>
          <CardDescription>{t("signUp.cardDescription")}</CardDescription>
        </CardHeader>
        <CardContent>
          <SignUpForm />
        </CardContent>
      </Card>

      <p className="text-sm text-muted-foreground">
        {t.rich("signUp.haveAccount", {
          link: (chunks) => (
            <Link href="/login" className="font-medium text-foreground underline underline-offset-4">
              {chunks}
            </Link>
          ),
        })}
      </p>
    </AuthPageShell>
  );
}
