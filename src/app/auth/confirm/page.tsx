import type { Metadata } from "next";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { InviteConfirm } from "@/features/auth/components/invite-confirm";
import { isSupabaseConfigured } from "@/lib/supabase/env";

export const metadata: Metadata = {
  title: "Davet doğrulama",
  robots: { index: false, follow: false },
};

export default function InviteConfirmPage() {
  if (!isSupabaseConfigured()) {
    return (
      <div className="mx-auto flex max-w-md flex-col gap-6 px-6 py-16 sm:py-24">
        <Card>
          <CardHeader>
            <CardTitle>Supabase yapılandırılmadı</CardTitle>
            <CardDescription>
              Daveti doğrulamak için <code>.env.local</code> dosyasına Supabase
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

  return (
    <div className="mx-auto flex max-w-md flex-col gap-6 px-6 py-16 sm:py-24">
      <div className="space-y-3">
        <p className="text-sm font-medium text-muted-foreground">Yönetim</p>
        <h1 className="text-3xl font-semibold tracking-tight">Davet doğrulama</h1>
        <p className="text-muted-foreground">
          Davet bağlantınız doğrulanıyor. Ardından parolanızı belirleyeceksiniz.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Bağlantı işleniyor</CardTitle>
          <CardDescription>
            Bu işlem genellikle birkaç saniye sürer.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <InviteConfirm />
        </CardContent>
      </Card>
    </div>
  );
}
