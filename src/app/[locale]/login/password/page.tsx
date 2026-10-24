import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { KeyRound } from "lucide-react";
import { getTranslations } from "next-intl/server";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { SupabaseNotConfigured } from "@/features/auth/components/auth-page-shell";
import { UpdatePasswordForm } from "@/features/auth/components/update-password-form";
import { getSessionUser } from "@/lib/auth/session";
import { isSupabaseConfigured } from "@/lib/supabase/env";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("auth.setPassword");
  return {
    title: t("title"),
    robots: { index: false, follow: false },
  };
}

export default async function SetPasswordPage() {
  const t = await getTranslations("auth");

  if (!isSupabaseConfigured()) {
    return (
      <div className="mx-auto flex max-w-md flex-col gap-6 px-6 py-16 sm:py-24">
        <SupabaseNotConfigured action={t("setPassword.notConfiguredAction")} />
      </div>
    );
  }

  const user = await getSessionUser();

  if (!user) {
    redirect("/login?invite=no-session");
  }

  return (
    <div className="mx-auto flex max-w-md flex-col gap-6 px-6 py-16 sm:py-24">
      <div className="space-y-3">
        <p className="text-sm font-medium text-muted-foreground">{t("eyebrow.admin")}</p>
        <h1 className="text-3xl font-semibold tracking-tight">{t("setPassword.title")}</h1>
        <p className="text-muted-foreground">{t("setPassword.description")}</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{t("setPassword.cardTitle")}</CardTitle>
          <CardDescription>{t("passwordForm.managerHint")}</CardDescription>
        </CardHeader>
        <CardContent>
          <UpdatePasswordForm />
        </CardContent>
      </Card>

      <p className="flex items-start gap-2 text-sm text-muted-foreground">
        <KeyRound aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
        {t("setPassword.storageNote")}
      </p>
    </div>
  );
}
