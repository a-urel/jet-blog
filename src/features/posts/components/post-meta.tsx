import Link from "next/link";
import { useFormatter, useTranslations } from "next-intl";

import { IdentityAvatar } from "@/features/avatars/components/identity-avatar";

import { archivePaths } from "../archives";
import { wasUpdatedAfterPublication } from "../mapping";
import type { PostSummary } from "../types";

// The post header and the listing cards pass withAvatars; search results keep
// a text-only byline. Avatars are decorative: each one sits inside the link
// with the visible author name.
export function PostMeta({
  post,
  withAvatars = false,
}: {
  post: PostSummary;
  withAvatars?: boolean;
}) {
  const t = useTranslations("posts.meta");
  const format = useFormatter();
  const updated = wasUpdatedAfterPublication(post);

  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground">
      {post.authors.length > 0 ? (
        <>
          <span className={withAvatars ? "flex flex-wrap items-center gap-x-1 gap-y-2" : undefined}>
            {post.authors.map(({ author }, index) => (
              <span key={author.id} className={withAvatars ? "inline-flex items-center" : undefined}>
                {index > 0 ? <span className={withAvatars ? "mr-2" : undefined}>, </span> : null}
                <Link
                  href={archivePaths.author(author.slug)}
                  className={
                    withAvatars
                      ? "inline-flex items-center gap-2 rounded-sm hover:text-foreground hover:underline underline-offset-4"
                      : "rounded-sm hover:text-foreground hover:underline underline-offset-4"
                  }
                >
                  {withAvatars ? (
                    <IdentityAvatar
                      kind="authors"
                      avatarId={author.avatarId}
                      name={author.name}
                      size="sm"
                    />
                  ) : null}
                  {author.name}
                </Link>
              </span>
            ))}
          </span>
          <span aria-hidden="true">/</span>
        </>
      ) : null}
      <time dateTime={post.publishedAt}>
        {format.dateTime(new Date(post.publishedAt), "date")}
      </time>
      {updated ? (
        <>
          <span aria-hidden="true">·</span>
          <span>
            {t.rich("updated", {
              date: format.dateTime(new Date(post.updatedAt), "date"),
              time: (chunks) => <time dateTime={post.updatedAt}>{chunks}</time>,
            })}
          </span>
        </>
      ) : null}
    </div>
  );
}
