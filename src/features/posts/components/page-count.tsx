import { useTranslations } from "next-intl";

import type { PageInfo } from "../pagination";

// Post total of a listing, plus the current page once there is more than one.
export function PageCount({ page, pageCount, total }: PageInfo) {
  const t = useTranslations("posts.pageCount");

  return (
    <span className="text-sm text-muted-foreground">
      {t("total", { count: total })}
      {pageCount > 1 ? ` · ${t("page", { page, pageCount })}` : null}
    </span>
  );
}
