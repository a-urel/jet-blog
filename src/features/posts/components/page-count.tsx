import type { PageInfo } from "../pagination";

// Post total of a listing, plus the current page once there is more than one.
export function PageCount({ page, pageCount, total }: PageInfo) {
  return (
    <span className="text-sm text-muted-foreground">
      {total} yazı
      {pageCount > 1 ? ` · Sayfa ${page} / ${pageCount}` : null}
    </span>
  );
}
