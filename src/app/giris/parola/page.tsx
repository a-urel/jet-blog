import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { KeyRound } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { UpdatePasswordForm } from "@/features/auth/components/update-password-form";
import { getSessionUser } from "@/lib/auth/session";
import { isSupabaseConfigured } from "@/lib/supabase/env";

export const metadata: Metadata = {
  title: "Parola belirle",
  robots: { index: false, follow: false },
};

export default async function SetPasswordPage() {
  if (!isSupabaseConfigured()) {
    return (
      <div className="mx-auto flex max-w-md flex-col gap-6 px-6 py-16 sm:py-24">
        <Card>
          <CardHeader>
            <CardTitle>Supabase yapılandırılmadı</CardTitle>
            <CardDescription>
              Parola belirlemek için <code>.env.local</code> dosyasına Supabase
              URL ve publishable key değerlerini ekleyin.
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

  if (!user) {
    redirect("/giris?davet=oturum-yok");
  }

  return (
    <div className="mx-auto flex max-w-md flex-col gap-6 px-6 py-16 sm:py-24">
      <div className="space-y-3">
        <p className="text-sm font-medium text-muted-foreground">Yönetim</p>
        <h1 className="text-3xl font-semibold tracking-tight">Parola belirle</h1>
        <p className="text-muted-foreground">
          Davetiniz doğrulandı. Devam etmek için bir parola belirleyin.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Hesabınızı tamamlayın</CardTitle>
          <CardDescription>
            Bu parolayı bir parola yöneticisinde saklamanız önerilir.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <UpdatePasswordForm />
        </CardContent>
      </Card>

      <p className="flex items-start gap-2 text-sm text-muted-foreground">
        <KeyRound aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
        Parolanız yalnızca Supabase Auth tarafından saklanır.
      </p>
    </div>
  );
}
