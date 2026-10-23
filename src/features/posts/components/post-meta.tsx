import Link from "next/link";

import { archivePaths } from "../archives";
import { wasUpdatedAfterPublication } from "../mapping";
import type { PostSummary } from "../types";

const dateFormatter = new Intl.DateTimeFormat("tr-TR", {
  day: "numeric",
  month: "long",
  year: "numeric",
  timeZone: "Europe/Istanbul",
});

export function PostMeta({ post }: { post: PostSummary }) {
  const updated = wasUpdatedAfterPublication(post);

  return (
    <div className="flex flex-wrap gap-x-3 gap-y-1 text-sm text-muted-foreground">
      {post.authors.length > 0 ? (
        <>
          <span>
            {post.authors.map(({ author }, index) => (
              <span key={author.id}>
                {index > 0 ? ", " : null}
                <Link
                  href={archivePaths.author(author.slug)}
                  className="rounded-sm hover:text-foreground hover:underline underline-offset-4"
                >
                  {author.name}
                </Link>
              </span>
            ))}
          </span>
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
