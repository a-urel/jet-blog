import { useFormatter, useTranslations } from "next-intl";

import { IdentityAvatar } from "@/features/avatars/components/identity-avatar";
import type { PublicComment } from "../queries";
import { CommentForm } from "./comment-form";
import { CommentItemActions } from "./comment-item-actions";
import { CommentViewerProvider } from "./comment-viewer-provider";

type CommentSectionProps = {
  postId: string;
  comments: PublicComment[];
};

// Server-rendered part of the post page: the visible comments and their count
// are in the prerendered HTML. Bodies are plain text rendered as React text
// (escaped), with line breaks preserved by CSS; no HTML is ever interpreted.
// Per-visitor controls hydrate inside CommentViewerProvider.
export function CommentSection({ postId, comments }: CommentSectionProps) {
  const t = useTranslations("comments.section");
  const format = useFormatter();

  return (
    <section aria-labelledby="comments-heading" className="space-y-6 border-t pt-8">
      <h2 id="comments-heading" className="text-xl font-semibold tracking-tight">
        {t("heading")} <span className="text-muted-foreground">({comments.length})</span>
      </h2>
      <CommentViewerProvider postId={postId} commentIds={comments.map((comment) => comment.id)}>
        {comments.length > 0 ? (
          <ol className="space-y-6">
            {comments.map((comment) => (
              <li key={comment.id} id={`comment-${comment.id}`} className="space-y-2">
                <article aria-label={t("commentLabel", { name: comment.displayName })}>
                  <header className="flex items-center gap-3 text-sm">
                    <IdentityAvatar
                      kind="profiles"
                      avatarId={comment.avatarId}
                      name={comment.displayName}
                    />
                    <div className="flex flex-wrap items-baseline gap-x-2">
                      <span className="font-medium">{comment.displayName}</span>
                      <time
                        dateTime={comment.createdAt}
                        className="text-muted-foreground"
                      >
                        {format.dateTime(new Date(comment.createdAt), "dateTimeLong")}
                      </time>
                    </div>
                  </header>
                  <p className="mt-1 pl-11 leading-relaxed break-words whitespace-pre-line">
                    {comment.body}
                  </p>
                </article>
                <CommentItemActions commentId={comment.id} authorName={comment.displayName} />
              </li>
            ))}
          </ol>
        ) : (
          <p className="text-sm text-muted-foreground">{t("empty")}</p>
        )}
        <CommentForm postId={postId} />
      </CommentViewerProvider>
    </section>
  );
}
