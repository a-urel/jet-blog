import Link from "next/link";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";

// Unknown or inaccessible posts under /admin. RLS hides other authors' drafts,
// so "not found" also covers "not allowed" without revealing which one.
export default function AdminNotFound() {
  const t = useTranslations("admin.missing");

  return (
    <div className="space-y-4 py-8">
      <p className="text-sm font-medium text-muted-foreground">404</p>
      <h1 className="text-2xl font-semibold">{t("title")}</h1>
      <p className="text-muted-foreground">{t("description")}</p>
      <Button asChild variant="outline">
        <Link href="/admin/posts">{t("back")}</Link>
      </Button>
    </div>
  );
}
