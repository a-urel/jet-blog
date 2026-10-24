import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { MessageSquare } from "lucide-react";
import { getFormatter, getTranslations } from "next-intl/server";

import { QueryStatusToast } from "@/components/status/query-status";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { EditorialAccessDenied } from "@/features/auth/components/editorial-access-denied";
import { signInPathFor } from "@/features/auth/return-path";
import { ModerationActions } from "@/features/comments/components/moderation-actions";
import { ModerationPagination } from "@/features/comments/components/moderation-pagination";
import { listModerationQueue } from "@/features/comments/data";
import {
  commentReportReasonKeys,
  isCommentReportReason,
  moderationStatusFromQuery,
} from "@/features/comments/model";
import {
  isModerationFilter,
  moderationFilters,
  moderationPageCount,
  moderationQueuePath,
  moderationQueueUrl,
  parseModerationPage,
  type ModerationFilter,
} from "@/features/comments/queries";
import { postPath } from "@/features/posts/archives";
import { canModerateComments, getEditorialContext } from "@/lib/auth/editorial";
import { cn } from "@/lib/utils";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("adminComments");
  return { title: t("metaTitle") };
}

// Counts reports per reason, in first-seen order. Unknown reasons (none are
// expected) show their stored value.
function reasonCounts(reports: { reason: string }[]): [string, number][] {
  const counts = new Map<string, number>();
  for (const report of reports) {
    counts.set(report.reason, (counts.get(report.reason) ?? 0) + 1);
  }
  return [...counts];
}

// Dynamic through the session read; the queue never enters a public cache.
// RLS (comments_select_editor) is the authorization rule for the rows, and
// moderate_comment() for every change; the role check picks the page.
export default async function AdminCommentsPage({
  searchParams,
}: PageProps<"/[locale]/admin/comments">) {
  const t = await getTranslations("adminComments");
  const tReasons = await getTranslations("comments.reportReasons");
  const format = await getFormatter();
  const { user, membership } = await getEditorialContext();
  if (!user) redirect(signInPathFor(moderationQueuePath));

  if (!canModerateComments(membership)) {
    return (
      <EditorialAccessDenied
        title={t("accessDenied.title")}
        description={t("accessDenied.description")}
        email={user.email}
      />
    );
  }

  const { filter: rawFilter, page: rawPage, status } = await searchParams;
  const filter: ModerationFilter = isModerationFilter(rawFilter) ? rawFilter : "reported";
  const page = parseModerationPage(rawPage);
  const { comments, total } = await listModerationQueue(filter, page);
  const pageCount = moderationPageCount(total);
  const statusMessage = moderationStatusFromQuery(status);

  const reasonSummary = (reports: { reason: string }[]) =>
    reasonCounts(reports)
      .map(([reason, count]) =>
        t("reasonCount", {
          reason: isCommentReportReason(reason)
            ? tReasons(commentReportReasonKeys[reason])
            : reason,
          count,
        }),
      )
      .join(", ");

  // Moderating the last row of the last page leaves that page empty; move to
  // the new last page and keep the success toast.
  if (page > pageCount) {
    redirect(
      moderationQueueUrl(filter, {
        page: pageCount,
        status: typeof status === "string" ? status : undefined,
      }),
    );
  }

  return (
    <div className="space-y-8">
      <div className="space-y-2">
        <h1 className="text-3xl font-semibold tracking-tight">{t("heading")}</h1>
        <p className="text-muted-foreground">{t("intro")}</p>
      </div>

      {statusMessage ? <QueryStatusToast message={t(`statusMessages.${statusMessage}`)} /> : null}

      <nav aria-label={t("filtersLabel")} className="flex flex-wrap gap-2">
        {moderationFilters.map((option) => (
          <Link
            key={option}
            href={moderationQueueUrl(option)}
            aria-current={option === filter ? "page" : undefined}
            className={cn(
              "rounded-lg border px-3 py-1.5 text-sm font-medium hover:bg-muted/80",
              option === filter && "bg-secondary text-secondary-foreground",
            )}
          >
            {t(`filters.${option}`)}
          </Link>
        ))}
      </nav>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <MessageSquare aria-hidden="true" className="size-5" />
            {t(`filterTitles.${filter}`)}
          </CardTitle>
          <CardDescription>
            {t(`filterDescriptions.${filter}`)}{" "}
            {pageCount > 1
              ? t("summaryPaged", { total, page, pageCount })
              : t("summary", { total })}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {comments.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("empty")}</p>
          ) : (
            <ul className="divide-y rounded-lg border">
              {comments.map(({ post, ...comment }) => (
                <li key={comment.id} className="space-y-3 px-4 py-4">
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
                    <span className="font-medium">{comment.displayName}</span>
                    <time dateTime={comment.createdAt} className="text-muted-foreground">
                      {format.dateTime(new Date(comment.createdAt), "dateTimeShort")}
                    </time>
                    <Badge variant={comment.status === "visible" ? "secondary" : "outline"}>
                      {t(`statusLabels.${comment.status}`)}
                    </Badge>
                    {comment.reports.length > 0 ? (
                      <Badge variant="destructive">
                        {t("reportCount", { count: comment.reports.length })}
                      </Badge>
                    ) : null}
                  </div>
                  {post ? (
                    <p className="text-sm text-muted-foreground">
                      {post.status === "published"
                        ? t.rich("post", {
                            title: post.title,
                            link: (chunks) => (
                              <Link
                                href={`${postPath(post.slug)}#comment-${comment.id}`}
                                className="text-foreground underline-offset-4 hover:underline"
                              >
                                {chunks}
                              </Link>
                            ),
                          })
                        : t.rich("postUnpublished", {
                            title: post.title,
                            muted: (chunks) => (
                              <span className="text-foreground">{chunks}</span>
                            ),
                          })}
                    </p>
                  ) : null}
                  <p className="leading-relaxed break-words whitespace-pre-line">
                    {comment.body}
                  </p>
                  {comment.reports.length > 0 ? (
                    <p className="text-sm text-muted-foreground">
                      {t("reasons", { reasons: reasonSummary(comment.reports) })}
                    </p>
                  ) : null}
                  <ModerationActions commentId={comment.id} status={comment.status} />
                </li>
              ))}
            </ul>
          )}
          <ModerationPagination filter={filter} page={page} pageCount={pageCount} />
        </CardContent>
      </Card>
    </div>
  );
}
