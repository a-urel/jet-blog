import type { Metadata } from "next";
import Link from "next/link";

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

export const metadata: Metadata = {
  title: "Parola sıfırlama",
  robots: { index: false, follow: false },
};

export default async function PasswordResetPage({
  searchParams,
}: PageProps<"/login/reset">) {
  const { link } = await searchParams;

  if (!isSupabaseConfigured()) {
    return (
      <AuthPageShell eyebrow="Hesap" title="Parola sıfırlama">
        <SupabaseNotConfigured action="Parola sıfırlamak" />
      </AuthPageShell>
    );
  }

  return (
    <AuthPageShell
      eyebrow="Hesap"
      title="Parola sıfırlama"
      description="E-posta adresinizi girin; kayıtlı bir hesap varsa sıfırlama bağlantısı göndereceğiz."
    >
      {link === "invalid" ? (
        <StatusNotice>
          Sıfırlama bağlantısı geçersiz, kullanılmış veya süresi dolmuş. Yeni bir
          bağlantı isteyin ve aynı tarayıcıda açın.
        </StatusNotice>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Sıfırlama bağlantısı isteyin</CardTitle>
          <CardDescription>
            Bağlantı bir saat geçerlidir ve yalnızca bir kez kullanılabilir.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <PasswordResetRequestForm />
        </CardContent>
      </Card>

      <p className="text-sm text-muted-foreground">
        <Link href="/login" className="font-medium text-foreground underline underline-offset-4">
          Giriş sayfasına dön
        </Link>
      </p>
    </AuthPageShell>
  );
}
