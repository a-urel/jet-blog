import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { MessageSquare } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { EditorialAccessDenied } from "@/features/auth/components/editorial-access-denied";
import { ModerationActions } from "@/features/comments/components/moderation-actions";
import { listModerationQueue } from "@/features/comments/data";
import {
  commentReportReasonLabels,
  commentStatusLabels,
  isCommentReportReason,
} from "@/features/comments/model";
import {
  isModerationFilter,
  moderationQueueLimit,
  type ModerationFilter,
} from "@/features/comments/queries";
import { postPath } from "@/features/posts/archives";
import { canModerateComments, getEditorialContext } from "@/lib/auth/editorial";
import { cn } from "@/lib/utils";

export const metadata: Metadata = {
  title: "Yorumlar",
};

const filterLabels: Record<ModerationFilter, string> = {
  reported: "Bildirilen",
  visible: "Görünür",
  hidden: "Gizlenen",
  deleted: "Silinen",
};

const filterDescriptions: Record<ModerationFilter, string> = {
  reported:
    "En az bir bildirim almış ve hâlâ görünür olan yorumlar. Bildirimler yorumu kendiliğinden gizlemez.",
  visible: "Sitede görünen tüm yorumlar.",
  hidden: "Gizlenen yorumlar sitede görünmez; yeniden gösterilebilir.",
  deleted: "Silinen yorumlar kalıcı olarak gizlidir ve geri alınamaz.",
};

const dateFormatter = new Intl.DateTimeFormat("tr-TR", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "Europe/Istanbul",
});

function reasonSummary(reports: { reason: string }[]): string {
  const counts = new Map<string, number>();
  for (const report of reports) {
    counts.set(report.reason, (counts.get(report.reason) ?? 0) + 1);
  }

  return [...counts]
    .map(([reason, count]) => {
      const label = isCommentReportReason(reason)
        ? commentReportReasonLabels[reason]
        : reason;
      return `${label} (${count})`;
    })
    .join(", ");
}

// Dynamic through the session read; the queue never enters a public cache.
// RLS (comments_select_editor) is the authorization rule for the rows, and
// moderate_comment() for every change; the role check picks the page.
export default async function AdminCommentsPage({
  searchParams,
}: PageProps<"/admin/comments">) {
  const { user, membership } = await getEditorialContext();
  if (!user) redirect("/login");

  if (!canModerateComments(membership)) {
    return (
      <EditorialAccessDenied
        title="Yorum moderasyonu kapalı"
        description="Yorumları yalnızca editörler ve adminler gizleyebilir veya silebilir."
        email={user.email}
      />
    );
  }

  const { filter: rawFilter } = await searchParams;
  const filter: ModerationFilter = isModerationFilter(rawFilter) ? rawFilter : "reported";
  const comments = await listModerationQueue(filter);

  return (
    <div className="space-y-8">
      <div className="space-y-2">
        <h1 className="text-3xl font-semibold tracking-tight">Yorumlar</h1>
        <p className="text-muted-foreground">
          Yorumlar gönderildiği anda yayımlanır; okur bildirimlerini inceleyip
          gerekirse gizleyin veya silin.
        </p>
      </div>

      <nav aria-label="Yorum filtreleri" className="flex flex-wrap gap-2">
        {(Object.keys(filterLabels) as ModerationFilter[]).map((option) => (
          <Link
            key={option}
            href={`/admin/comments?filter=${option}`}
            aria-current={option === filter ? "page" : undefined}
            className={cn(
              "rounded-lg border px-3 py-1.5 text-sm font-medium hover:bg-muted/80",
              option === filter && "bg-secondary text-secondary-foreground",
            )}
          >
            {filterLabels[option]}
          </Link>
        ))}
      </nav>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <MessageSquare aria-hidden="true" className="size-5" />
            {filterLabels[filter]} yorumlar
          </CardTitle>
          <CardDescription>
            {filterDescriptions[filter]} En yeni {moderationQueueLimit} yorum listelenir.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {comments.length === 0 ? (
            <p className="text-sm text-muted-foreground">Bu filtrede yorum yok.</p>
          ) : (
            <ul className="divide-y rounded-lg border">
              {comments.map((comment) => (
                <li key={comment.id} className="space-y-3 px-4 py-4">
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
                    <span className="font-medium">{comment.displayName}</span>
                    <time dateTime={comment.createdAt} className="text-muted-foreground">
                      {dateFormatter.format(new Date(comment.createdAt))}
                    </time>
                    <Badge variant={comment.status === "visible" ? "secondary" : "outline"}>
                      {commentStatusLabels[comment.status]}
                    </Badge>
                    {comment.reports.length > 0 ? (
                      <Badge variant="destructive">{comment.reports.length} bildirim</Badge>
                    ) : null}
                  </div>
                  {comment.post ? (
                    <p className="text-sm text-muted-foreground">
                      Yazı:{" "}
                      {comment.post.status === "published" ? (
                        <Link
                          href={`${postPath(comment.post.slug)}#comment-${comment.id}`}
                          className="text-foreground underline-offset-4 hover:underline"
                        >
                          {comment.post.title}
                        </Link>
                      ) : (
                        <span className="text-foreground">
                          {comment.post.title} (yayında değil)
                        </span>
                      )}
                    </p>
                  ) : null}
                  <p className="leading-relaxed break-words whitespace-pre-line">
                    {comment.body}
                  </p>
                  {comment.reports.length > 0 ? (
                    <p className="text-sm text-muted-foreground">
                      Bildirim nedenleri: {reasonSummary(comment.reports)}
                    </p>
                  ) : null}
                  <ModerationActions commentId={comment.id} status={comment.status} />
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
