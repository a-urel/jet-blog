import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { LockKeyhole } from "lucide-react";

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
import { getEditorialContext } from "@/lib/auth/editorial";
import { isSupabaseConfigured } from "@/lib/supabase/env";

export const metadata: Metadata = {
  title: "Giriş",
  robots: { index: false, follow: false },
};

const noticeMessages = {
  signedOut: "Oturumunuz kapatıldı.",
  inviteNoSession: "Parola belirlemek için davet bağlantısını yeniden açın.",
  inviteInvalid: "Davet bağlantısı geçersiz veya süresi dolmuş.",
  confirmFailed:
    "Doğrulama bağlantısı bu tarayıcıda tamamlanamadı. Bağlantı geçerliyse e-postanız doğrulanmıştır; giriş yapmayı deneyin.",
  accountDeleted: "Hesabınız ve hesabınıza bağlı veriler silindi.",
} as const;

export default async function SignInPage({
  searchParams,
}: PageProps<"/login">) {
  const {
    "signed-out": signedOut,
    invite,
    confirm,
    account,
  } = await searchParams;

  const notice = signedOut
    ? noticeMessages.signedOut
    : invite === "no-session"
      ? noticeMessages.inviteNoSession
      : invite === "invalid"
        ? noticeMessages.inviteInvalid
        : confirm === "failed"
          ? noticeMessages.confirmFailed
          : account === "deleted"
            ? noticeMessages.accountDeleted
            : null;

  if (!isSupabaseConfigured()) {
    return (
      <AuthPageShell eyebrow="Hesap" title="Giriş">
        <SupabaseNotConfigured action="Giriş yapmak" />
      </AuthPageShell>
    );
  }

  const { user, membership } = await getEditorialContext();
  if (user) redirect(membership ? "/admin" : "/account");

  return (
    <AuthPageShell
      eyebrow="Hesap"
      title="Giriş"
      description="Okur hesabınızla veya davet edildiğiniz editöryal hesapla giriş yapın."
    >
      {notice ? <StatusNotice>{notice}</StatusNotice> : null}

      <Card>
        <CardHeader>
          <CardTitle>Hesabınızla giriş yapın</CardTitle>
          <CardDescription>
            Yönetim alanı yalnızca davet edilen editöryal üyelere açıktır.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <SignInForm />
          <p className="text-sm">
            <Link
              href="/login/reset"
              className="text-muted-foreground underline underline-offset-4 hover:text-foreground"
            >
              Parolamı unuttum
            </Link>
          </p>
        </CardContent>
      </Card>

      <p className="text-sm text-muted-foreground">
        Hesabınız yok mu?{" "}
        <Link href="/signup" className="font-medium text-foreground underline underline-offset-4">
          Okur hesabı oluşturun
        </Link>
      </p>

      <p className="flex items-start gap-2 text-sm text-muted-foreground">
        <LockKeyhole aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
        Oturum bilgileri güvenli çerezlerde tutulur ve her istekte sunucuda
        doğrulanır.
      </p>
    </AuthPageShell>
  );
}
