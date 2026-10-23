"use client";

import { RouteError } from "@/components/status/route-error";

// Public pages throw instead of caching an empty result when Supabase fails
// (src/features/posts/data.ts), so a transient outage lands here, inside the
// root layout.
export default function PublicError({
  error,
  retry,
}: {
  error: unknown;
  retry: () => void;
}) {
  return (
    <RouteError
      error={error}
      retry={retry}
      title="Sayfa şu anda yüklenemedi"
      description="İçerik geçici olarak alınamadı. Birazdan tekrar deneyin."
      backHref="/"
      backLabel="Yazılara dön"
    />
  );
}
