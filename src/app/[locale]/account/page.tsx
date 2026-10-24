import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Bookmark, KeyRound, LogOut, ShieldCheck } from "lucide-react";
import { getTranslations } from "next-intl/server";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { removeOwnAvatarAction, updateOwnAvatarAction } from "@/features/account/actions";
import { DeleteAccountForm } from "@/features/account/components/delete-account-form";
import { DisplayNameForm } from "@/features/account/components/display-name-form";
import { getOwnProfile } from "@/features/account/data";
import { signOutAction } from "@/features/auth/actions";
import { AvatarForm } from "@/features/avatars/components/avatar-form";
import { IdentityAvatar } from "@/features/avatars/components/identity-avatar";
import {
  AuthPageShell,
  StatusNotice,
  SupabaseNotConfigured,
} from "@/features/auth/components/auth-page-shell";
import { getEditorialContext } from "@/lib/auth/editorial";
import { isSupabaseConfigured } from "@/lib/supabase/env";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("account");
  return { title: t("title") };
}

export default async function AccountPage({
  searchParams,
}: PageProps<"/[locale]/account">) {
  const [t, tAuth] = await Promise.all([
    getTranslations("account"),
    getTranslations("auth"),
  ]);

  if (!isSupabaseConfigured()) {
    return (
      <AuthPageShell eyebrow={tAuth("eyebrow.account")} title={t("title")}>
        <SupabaseNotConfigured action={t("notConfiguredAction")} />
      </AuthPageShell>
    );
  }

  const { user, membership } = await getEditorialContext();
  if (!user) redirect("/login");

  const [{ confirmed, password }, profile] = await Promise.all([
    searchParams,
    getOwnProfile(user.id),
  ]);

  const notice =
    confirmed === "1"
      ? t("notices.confirmed")
      : password === "updated"
        ? t("notices.passwordUpdated")
        : null;

  const displayName = profile?.display_name ?? null;
  const avatarId = profile?.avatar_id ?? null;
  const isActiveAdmin = membership?.role === "admin";

  return (
    <AuthPageShell
      eyebrow={tAuth("eyebrow.account")}
      title={t("title")}
      description={t.rich("session", {
        email: () => <span className="font-medium text-foreground">{user.email}</span>,
      })}
    >
      {notice ? <StatusNotice>{notice}</StatusNotice> : null}

      {membership ? (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ShieldCheck aria-hidden="true" className="size-5" />
              {t("membership.title")}
            </CardTitle>
            <CardDescription>{t("membership.description")}</CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild variant="outline">
              <Link href="/admin">{t("membership.goToAdmin")}</Link>
            </Button>
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>{t("saved.title")}</CardTitle>
          <CardDescription>{t("saved.description")}</CardDescription>
        </CardHeader>
        <CardContent>
          <Button asChild variant="outline">
            <Link href="/account/saved">
              <Bookmark aria-hidden="true" />
              {t("saved.link")}
            </Link>
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t("displayName.title")}</CardTitle>
          <CardDescription>
            {displayName
              ? t("displayName.description")
              : t("displayName.missingDescription")}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <DisplayNameForm displayName={displayName} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t("avatar.title")}</CardTitle>
          <CardDescription>{t("avatar.description")}</CardDescription>
        </CardHeader>
        <CardContent>
          <AvatarForm
            idPrefix="account"
            hasAvatar={avatarId !== null}
            uploadAction={updateOwnAvatarAction}
            removeAction={removeOwnAvatarAction}
            preview={
              <IdentityAvatar
                kind="profiles"
                avatarId={avatarId}
                name={displayName ?? user.email ?? "?"}
                size="xl"
                alt={avatarId ? t("avatar.alt") : t("avatar.missingAlt")}
              />
            }
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t("password.title")}</CardTitle>
          <CardDescription>{t("password.description")}</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-3">
          <Button asChild variant="outline">
            <Link href="/account/password">
              <KeyRound aria-hidden="true" />
              {t("password.change")}
            </Link>
          </Button>
          <form action={signOutAction}>
            <Button type="submit" variant="outline">
              <LogOut aria-hidden="true" />
              {t("password.signOut")}
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card className="border-destructive/40">
        <CardHeader>
          <CardTitle>{t("delete.title")}</CardTitle>
          <CardDescription>{t("delete.description")}</CardDescription>
        </CardHeader>
        <CardContent>
          {isActiveAdmin ? (
            <p className="text-sm text-muted-foreground">
              {t("delete.activeAdmin")}
            </p>
          ) : (
            <DeleteAccountForm />
          )}
        </CardContent>
      </Card>
    </AuthPageShell>
  );
}
