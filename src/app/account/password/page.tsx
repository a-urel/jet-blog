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
import { UpdatePasswordForm } from "@/features/auth/components/update-password-form";
import { getSessionUser } from "@/lib/auth/session";
import { isSupabaseConfigured } from "@/lib/supabase/env";

export const metadata: Metadata = {
  title: "Parola değiştir",
};

export default async function AccountPasswordPage({
  searchParams,
}: PageProps<"/account/password">) {
  if (!isSupabaseConfigured()) {
    return (
      <AuthPageShell eyebrow="Hesap" title="Parola değiştir">
        <SupabaseNotConfigured action="Parola değiştirmek" />
      </AuthPageShell>
    );
  }

  const user = await getSessionUser();
  if (!user) redirect("/login/reset");

  const { recovery } = await searchParams;

  return (
    <AuthPageShell
      eyebrow="Hesap"
      title={recovery === "1" ? "Yeni parola belirle" : "Parola değiştir"}
      description={
        recovery === "1"
          ? "Sıfırlama bağlantınız doğrulandı. Yeni parolanızı belirleyin."
          : undefined
      }
    >
      <Card>
        <CardHeader>
          <CardTitle>Yeni parola</CardTitle>
          <CardDescription>
            Bu parolayı bir parola yöneticisinde saklamanız önerilir.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <UpdatePasswordForm />
        </CardContent>
      </Card>

      <p className="text-sm text-muted-foreground">
        <Link href="/account" className="font-medium text-foreground underline underline-offset-4">
          Hesabıma dön
        </Link>
      </p>
    </AuthPageShell>
  );
}
