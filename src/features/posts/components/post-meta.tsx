import { wasUpdatedAfterPublication } from "../mapping";
import type { PostSummary } from "../types";

const dateFormatter = new Intl.DateTimeFormat("tr-TR", {
  day: "numeric",
  month: "long",
  year: "numeric",
  timeZone: "Europe/Istanbul",
});

export function PostMeta({ post }: { post: PostSummary }) {
  const authorNames = post.authors.map(({ author }) => author.name).join(", ");
  const updated = wasUpdatedAfterPublication(post);

  return (
    <div className="flex flex-wrap gap-x-3 gap-y-1 text-sm text-muted-foreground">
      {authorNames ? (
        <>
          <span>{authorNames}</span>
          <span aria-hidden="true">/</span>
        </>
      ) : null}
      <time dateTime={post.publishedAt}>
        {dateFormatter.format(new Date(post.publishedAt))}
      </time>
      {updated ? (
        <>
          <span aria-hidden="true">·</span>
          <span>
            Güncellendi{" "}
            <time dateTime={post.updatedAt}>
              {dateFormatter.format(new Date(post.updatedAt))}
            </time>
          </span>
        </>
      ) : null}
    </div>
  );
}
