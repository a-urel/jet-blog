import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { LockKeyhole } from "lucide-react";
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
import { SignInForm } from "@/features/auth/components/sign-in-form";
import { returnPathForMember, safeReturnPath } from "@/features/auth/return-path";
import { getEditorialContext } from "@/lib/auth/editorial";
import { isSupabaseConfigured } from "@/lib/supabase/env";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("auth.signIn");
  return {
    title: t("title"),
    robots: { index: false, follow: false },
  };
}

export default async function SignInPage({
  searchParams,
}: PageProps<"/[locale]/login">) {
  const {
    "signed-out": signedOut,
    invite,
    confirm,
    account,
    next,
  } = await searchParams;
  const returnPath = safeReturnPath(next);
  const t = await getTranslations("auth");

  const notice = signedOut
    ? t("signIn.notices.signedOut")
    : invite === "no-session"
      ? t("signIn.notices.inviteNoSession")
      : invite === "invalid"
        ? t("signIn.notices.inviteInvalid")
        : confirm === "failed"
          ? t("signIn.notices.confirmFailed")
          : account === "deleted"
            ? t("signIn.notices.accountDeleted")
            : null;

  if (!isSupabaseConfigured()) {
    return (
      <AuthPageShell eyebrow={t("eyebrow.account")} title={t("signIn.title")}>
        <SupabaseNotConfigured action={t("signIn.notConfiguredAction")} />
      </AuthPageShell>
    );
  }

  const { user, membership } = await getEditorialContext();
  if (user) {
    redirect(returnPathForMember(next, Boolean(membership)) ?? (membership ? "/admin" : "/account"));
  }

  return (
    <AuthPageShell
      eyebrow={t("eyebrow.account")}
      title={t("signIn.title")}
      description={t("signIn.description")}
    >
      {notice ? <StatusNotice>{notice}</StatusNotice> : null}

      <Card>
        <CardHeader>
          <CardTitle>{t("signIn.cardTitle")}</CardTitle>
          <CardDescription>{t("signIn.cardDescription")}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {returnPath ? (
            <p className="text-sm text-muted-foreground">
              {t("signIn.returnNotice")}
            </p>
          ) : null}
          <SignInForm returnPath={returnPath} />
          <p className="text-sm">
            <Link
              href="/login/reset"
              className="text-muted-foreground underline underline-offset-4 hover:text-foreground"
            >
              {t("signIn.forgotPassword")}
            </Link>
          </p>
        </CardContent>
      </Card>

      <p className="text-sm text-muted-foreground">
        {t.rich("signIn.noAccount", {
          link: (chunks) => (
            <Link href="/signup" className="font-medium text-foreground underline underline-offset-4">
              {chunks}
            </Link>
          ),
        })}
      </p>

      <p className="flex items-start gap-2 text-sm text-muted-foreground">
        <LockKeyhole aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
        {t("signIn.sessionNote")}
      </p>
    </AuthPageShell>
  );
}
