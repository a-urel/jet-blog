import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { SupabaseNotConfigured } from "@/features/auth/components/auth-page-shell";
import { InviteConfirm } from "@/features/auth/components/invite-confirm";
import { isSupabaseConfigured } from "@/lib/supabase/env";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("auth.inviteConfirm");
  return {
    title: t("title"),
    robots: { index: false, follow: false },
  };
}

export default async function InviteConfirmPage() {
  const t = await getTranslations("auth");

  if (!isSupabaseConfigured()) {
    return (
      <div className="mx-auto flex max-w-md flex-col gap-6 px-6 py-16 sm:py-24">
        <SupabaseNotConfigured action={t("inviteConfirm.notConfiguredAction")} />
      </div>
    );
  }

  return (
    <div className="mx-auto flex max-w-md flex-col gap-6 px-6 py-16 sm:py-24">
      <div className="space-y-3">
        <p className="text-sm font-medium text-muted-foreground">{t("eyebrow.admin")}</p>
        <h1 className="text-3xl font-semibold tracking-tight">{t("inviteConfirm.title")}</h1>
        <p className="text-muted-foreground">{t("inviteConfirm.description")}</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{t("inviteConfirm.cardTitle")}</CardTitle>
          <CardDescription>{t("inviteConfirm.cardDescription")}</CardDescription>
        </CardHeader>
        <CardContent>
          <InviteConfirm />
        </CardContent>
      </Card>
    </div>
  );
}
