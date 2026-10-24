"use client";

import { useTranslations } from "next-intl";

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
  const t = useTranslations("common.error");

  return (
    <RouteError
      error={error}
      retry={retry}
      title={t("publicTitle")}
      description={t("publicDescription")}
      backHref="/"
      backLabel={t("backToPosts")}
    />
  );
}
