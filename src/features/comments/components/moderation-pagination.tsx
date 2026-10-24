import { useTranslations } from "next-intl";

import {
  Pagination,
  PaginationContent,
  PaginationEllipsis,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from "@/components/ui/pagination";
import { paginationItems } from "@/features/posts/pagination";
import { moderationQueueUrl, type ModerationFilter } from "../queries";

// Same controls as the search pagination, with ?page= links: the queue is
// dynamic, so a query parameter costs no caching. Links drop ?status=.
export function ModerationPagination({
  filter,
  page,
  pageCount,
}: {
  filter: ModerationFilter;
  page: number;
  pageCount: number;
}) {
  const t = useTranslations("adminComments.pagination");
  const tCommon = useTranslations("common.pagination");

  if (pageCount <= 1) return null;

  const href = (target: number) => moderationQueueUrl(filter, { page: target });

  return (
    <Pagination aria-label={t("label")} className="mt-6">
      <PaginationContent className="flex-wrap justify-center">
        {page > 1 ? (
          <PaginationItem>
            <PaginationPrevious href={href(page - 1)} />
          </PaginationItem>
        ) : null}
        {paginationItems(page, pageCount).map((item, index) => (
          <PaginationItem key={item === "ellipsis" ? `ellipsis-${index}` : item}>
            {item === "ellipsis" ? (
              <PaginationEllipsis />
            ) : (
              <PaginationLink
                href={href(item)}
                isActive={item === page}
                aria-label={
                  item === page
                    ? t("currentPage", { page: item })
                    : tCommon("page", { page: item })
                }
              >
                {item}
              </PaginationLink>
            )}
          </PaginationItem>
        ))}
        {page < pageCount ? (
          <PaginationItem>
            <PaginationNext href={href(page + 1)} />
          </PaginationItem>
        ) : null}
      </PaginationContent>
    </Pagination>
  );
}
