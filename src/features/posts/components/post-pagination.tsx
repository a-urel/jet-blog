import {
  Pagination,
  PaginationContent,
  PaginationEllipsis,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from "@/components/ui/pagination";
import { pagePath, paginationItems, type PageInfo } from "../pagination";

// Page links of a public listing. Plain links (no client state), so every
// page stays shared ISR output and works without JavaScript. The first and
// last pages have no previous/next link instead of a disabled one.
export function PostPagination({
  basePath,
  page,
  pageCount,
}: Pick<PageInfo, "page" | "pageCount"> & { basePath: string }) {
  if (pageCount <= 1) return null;

  return (
    <Pagination className="mt-12">
      <PaginationContent className="flex-wrap justify-center">
        {page > 1 ? (
          <PaginationItem>
            <PaginationPrevious href={pagePath(basePath, page - 1)} />
          </PaginationItem>
        ) : null}
        {paginationItems(page, pageCount).map((item, index) => (
          <PaginationItem key={item === "ellipsis" ? `ellipsis-${index}` : item}>
            {item === "ellipsis" ? (
              <PaginationEllipsis />
            ) : (
              <PaginationLink
                href={pagePath(basePath, item)}
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
            <PaginationNext href={pagePath(basePath, page + 1)} />
          </PaginationItem>
        ) : null}
      </PaginationContent>
    </Pagination>
  );
}
