import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { LockKeyhole } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { SignInForm } from "@/features/auth/components/sign-in-form";
import { getSessionUser } from "@/lib/auth/session";
import { isSupabaseConfigured } from "@/lib/supabase/env";

export const metadata: Metadata = {
  title: "Giriş",
  robots: { index: false, follow: false },
};

export default async function SignInPage({
  searchParams,
}: PageProps<"/login">) {
  const { "signed-out": signedOut, invite } = await searchParams;

  const inviteMessage =
    invite === "no-session"
      ? "Parola belirlemek için davet bağlantısını yeniden açın."
      : invite === "invalid"
        ? "Davet bağlantısı geçersiz veya süresi dolmuş."
        : null;

  if (!isSupabaseConfigured()) {
    return (
      <div className="mx-auto flex max-w-md flex-col gap-6 px-6 py-16 sm:py-24">
        <div className="space-y-3">
          <p className="text-sm font-medium text-muted-foreground">Yönetim</p>
          <h1 className="text-3xl font-semibold tracking-tight">Giriş</h1>
        </div>
        <Card>
          <CardHeader>
            <CardTitle>Supabase yapılandırılmadı</CardTitle>
            <CardDescription>
              Yönetim alanını kullanmak için <code>.env.local</code> dosyasına
              Supabase URL ve publishable key değerlerini ekleyin.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild variant="outline">
              <Link href="/">Yazılara dön</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const user = await getSessionUser();
  if (user) redirect("/admin");

  return (
    <div className="mx-auto flex max-w-md flex-col gap-6 px-6 py-16 sm:py-24">
      <div className="space-y-3">
        <p className="text-sm font-medium text-muted-foreground">Yönetim</p>
        <h1 className="text-3xl font-semibold tracking-tight">Giriş</h1>
        <p className="text-muted-foreground">
          Yönetim alanı yalnızca davet edilen editörlere açıktır.
        </p>
      </div>

      {signedOut ? (
        <p
          role="status"
          className="rounded-lg border bg-muted/50 px-3 py-2 text-sm text-muted-foreground"
        >
          Oturumunuz kapatıldı.
        </p>
      ) : null}

      {inviteMessage ? (
        <p
          role="status"
          className="rounded-lg border bg-muted/50 px-3 py-2 text-sm text-muted-foreground"
        >
          {inviteMessage}
        </p>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Hesabınızla giriş yapın</CardTitle>
          <CardDescription>
            Genel kayıt yoktur. Erişim için bir yöneticiden davet isteyin.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <SignInForm />
        </CardContent>
      </Card>

      <p className="flex items-start gap-2 text-sm text-muted-foreground">
        <LockKeyhole aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
        Oturum bilgileri güvenli çerezlerde tutulur ve her istekte sunucuda
        doğrulanır.
      </p>
    </div>
  );
}
