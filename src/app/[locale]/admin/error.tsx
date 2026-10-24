"use client";

import { useTranslations } from "next-intl";

import { RouteError } from "@/components/status/route-error";

// Renders inside the admin layout, so navigation stays available. Unsaved
// form input of the failed page is not recoverable from here.
export default function AdminError({
  error,
  retry,
}: {
  error: unknown;
  retry: () => void;
}) {
  const t = useTranslations("admin.error");

  return (
    <RouteError
      error={error}
      retry={retry}
      title={t("title")}
      description={t("description")}
      backHref="/admin"
      backLabel={t("back")}
    />
  );
}
