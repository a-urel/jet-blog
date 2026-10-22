"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CircleAlert, Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { createInviteConfirmationSupabaseClient } from "@/lib/supabase/client";

const invalidMessage =
  "Davet bağlantısı geçersiz veya süresi dolmuş. Yeni bir davet isteyin.";

export function InviteConfirm() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function confirmInvite() {
      const query = new URLSearchParams(window.location.search);
      const queryError = query.get("error_description") ?? query.get("error");

      if (queryError) {
        if (!cancelled) setError(invalidMessage);
        return;
      }

      const fragment = new URLSearchParams(
        window.location.hash.replace(/^#/, ""),
      );
      const fragmentError = fragment.get("error_description");

      if (fragmentError) {
        if (!cancelled) setError(invalidMessage);
        return;
      }

      const accessToken = fragment.get("access_token");
      const refreshToken = fragment.get("refresh_token");

      if (!accessToken || !refreshToken) {
        if (!cancelled) setError(invalidMessage);
        return;
      }

      const supabase = createInviteConfirmationSupabaseClient();
      const { error: sessionError } = await supabase.auth.setSession({
        access_token: accessToken,
        refresh_token: refreshToken,
      });

      if (cancelled) return;

      if (sessionError) {
        setError(invalidMessage);
        return;
      }

      router.replace("/giris/parola");
    }

    void confirmInvite();

    return () => {
      cancelled = true;
    };
  }, [router]);

  if (error) {
    return (
      <div className="space-y-5">
        <p
          role="alert"
          className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive"
        >
          <CircleAlert aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
          {error}
        </p>
        <Button asChild variant="outline">
          <Link href="/giris">Giriş sayfasına dön</Link>
        </Button>
      </div>
    );
  }

  return (
    <p
      role="status"
      className="flex items-center gap-2 text-sm text-muted-foreground"
    >
      <Loader2 aria-hidden="true" className="size-4 animate-spin" />
      Davet doğrulanıyor…
    </p>
  );
}
