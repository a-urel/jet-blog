"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CircleAlert, Loader2 } from "lucide-react";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import { createInviteConfirmationSupabaseClient } from "@/lib/supabase/client";

export function InviteConfirm() {
  const t = useTranslations("auth.inviteConfirm");
  const router = useRouter();
  const [invalid, setInvalid] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function confirmInvite() {
      const query = new URLSearchParams(window.location.search);
      const queryError = query.get("error_description") ?? query.get("error");

      if (queryError) {
        if (!cancelled) setInvalid(true);
        return;
      }

      const fragment = new URLSearchParams(
        window.location.hash.replace(/^#/, ""),
      );
      const fragmentError = fragment.get("error_description");

      if (fragmentError) {
        if (!cancelled) setInvalid(true);
        return;
      }

      const accessToken = fragment.get("access_token");
      const refreshToken = fragment.get("refresh_token");

      if (!accessToken || !refreshToken) {
        if (!cancelled) setInvalid(true);
        return;
      }

      const supabase = createInviteConfirmationSupabaseClient();
      const { error: sessionError } = await supabase.auth.setSession({
        access_token: accessToken,
        refresh_token: refreshToken,
      });

      if (cancelled) return;

      if (sessionError) {
        setInvalid(true);
        return;
      }

      router.replace("/login/password");
    }

    void confirmInvite();

    return () => {
      cancelled = true;
    };
  }, [router]);

  if (invalid) {
    return (
      <div className="space-y-5">
        <p
          role="alert"
          className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive"
        >
          <CircleAlert aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
          {t("invalid")}
        </p>
        <Button asChild variant="outline">
          <Link href="/login">{t("backToSignIn")}</Link>
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
      {t("pending")}
    </p>
  );
}
