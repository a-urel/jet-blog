"use client";

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
  return (
    <RouteError
      error={error}
      retry={retry}
      title="Bu yönetim sayfası yüklenemedi"
      description="Veriler alınırken bir hata oluştu. Tekrar deneyin; sorun sürerse oturumunuzu yenileyin."
      backHref="/admin"
      backLabel="Genel bakışa dön"
    />
  );
}
