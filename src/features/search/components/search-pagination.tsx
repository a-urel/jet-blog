import {
  Pagination,
  PaginationContent,
  PaginationEllipsis,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from "@/components/ui/pagination";
import type { PostLanguage } from "@/features/posts/language";
import { paginationItems } from "@/features/posts/pagination";
import { searchUrl } from "../query";

// Same controls as the listing pagination, with ?page= links: search is
// dynamic anyway, so a query parameter costs no caching.
export function SearchPagination({
  query,
  language,
  page,
  pageCount,
}: {
  query: string;
  language: PostLanguage | null;
  page: number;
  pageCount: number;
}) {
  if (pageCount <= 1) return null;

  const href = (target: number) => searchUrl(query, { page: target, language });

  return (
    <Pagination className="mt-12">
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
                aria-label={item === page ? `Sayfa ${item}, geçerli sayfa` : `Sayfa ${item}`}
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
