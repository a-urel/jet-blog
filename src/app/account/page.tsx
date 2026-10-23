import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Bookmark, KeyRound, LogOut, ShieldCheck } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { DeleteAccountForm } from "@/features/account/components/delete-account-form";
import { DisplayNameForm } from "@/features/account/components/display-name-form";
import { getOwnProfile } from "@/features/account/data";
import { signOutAction } from "@/features/auth/actions";
import {
  AuthPageShell,
  StatusNotice,
  SupabaseNotConfigured,
} from "@/features/auth/components/auth-page-shell";
import { getEditorialContext } from "@/lib/auth/editorial";
import { isSupabaseConfigured } from "@/lib/supabase/env";

export const metadata: Metadata = {
  title: "Hesabım",
};

export default async function AccountPage({
  searchParams,
}: PageProps<"/account">) {
  if (!isSupabaseConfigured()) {
    return (
      <AuthPageShell eyebrow="Hesap" title="Hesabım">
        <SupabaseNotConfigured action="Hesabınızı yönetmek" />
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
      ? "E-posta adresiniz doğrulandı. Hoş geldiniz."
      : password === "updated"
        ? "Parolanız güncellendi."
        : null;

  const displayName = profile?.display_name ?? null;
  const isActiveAdmin = membership?.role === "admin";

  return (
    <AuthPageShell
      eyebrow="Hesap"
      title="Hesabım"
      description={
        <>
          Oturum: <span className="font-medium text-foreground">{user.email}</span>
        </>
      }
    >
      {notice ? <StatusNotice>{notice}</StatusNotice> : null}

      {membership ? (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ShieldCheck aria-hidden="true" className="size-5" />
              Editöryal üyelik
            </CardTitle>
            <CardDescription>
              Bu hesabın yönetim alanına erişimi var.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild variant="outline">
              <Link href="/admin">Yönetim alanına git</Link>
            </Button>
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Kaydedilenler</CardTitle>
          <CardDescription>
            Kaydettiğiniz yazılar yalnızca size görünür.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button asChild variant="outline">
            <Link href="/account/saved">
              <Bookmark aria-hidden="true" />
              Kaydedilen yazılar
            </Link>
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Görünen ad</CardTitle>
          <CardDescription>
            {displayName
              ? "Yorum gibi okur özelliklerinde görünecek ad."
              : "Henüz bir görünen ad belirlemediniz. Okur özelliklerini kullanmadan önce bir ad girin."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <DisplayNameForm displayName={displayName} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Parola ve oturum</CardTitle>
          <CardDescription>
            Parolanızı değiştirebilir veya bu cihazdaki oturumu kapatabilirsiniz.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-3">
          <Button asChild variant="outline">
            <Link href="/account/password">
              <KeyRound aria-hidden="true" />
              Parolayı değiştir
            </Link>
          </Button>
          <form action={signOutAction}>
            <Button type="submit" variant="outline">
              <LogOut aria-hidden="true" />
              Çıkış yap
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card className="border-destructive/40">
        <CardHeader>
          <CardTitle>Hesabı sil</CardTitle>
          <CardDescription>
            Hesabınız, profiliniz ve hesabınıza bağlı okur verileri kalıcı olarak
            silinir. Editöryal üyeyseniz yazdığınız yazılar ve yazar künyeleri
            yayında kalır.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isActiveAdmin ? (
            <p className="text-sm text-muted-foreground">
              Aktif admin hesapları silinemez. Hesabı silmeden önce başka bir
              admin rolünüzü değiştirmeli veya üyeliğinizi devre dışı
              bırakmalıdır.
            </p>
          ) : (
            <DeleteAccountForm />
          )}
        </CardContent>
      </Card>
    </AuthPageShell>
  );
}
