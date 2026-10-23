import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

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

export const metadata: Metadata = {
  title: "Hesap oluştur",
  robots: { index: false, follow: false },
};

export default async function SignUpPage() {
  if (!isSupabaseConfigured()) {
    return (
      <AuthPageShell eyebrow="Okur hesabı" title="Hesap oluştur">
        <SupabaseNotConfigured action="Hesap oluşturmak" />
      </AuthPageShell>
    );
  }

  if (await getSessionUser()) redirect("/account");

  return (
    <AuthPageShell
      eyebrow="Okur hesabı"
      title="Hesap oluştur"
      description="Yazıları okumak için hesap gerekmez. Okur hesabıyla yazıları kaydedebilir ve yorum yazabilirsiniz."
    >
      <Card>
        <CardHeader>
          <CardTitle>E-posta ve parola ile kaydolun</CardTitle>
          <CardDescription>
            Hesabınızı kullanmadan önce e-posta adresinizi doğrulamanız gerekir.
            Okur hesabı yönetim alanına erişim vermez.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <SignUpForm />
        </CardContent>
      </Card>

      <p className="text-sm text-muted-foreground">
        Zaten hesabınız var mı?{" "}
        <Link href="/login" className="font-medium text-foreground underline underline-offset-4">
          Giriş yapın
        </Link>
      </p>
    </AuthPageShell>
  );
}
