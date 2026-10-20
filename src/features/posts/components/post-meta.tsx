import type { Post } from "../types";

const dateFormatter = new Intl.DateTimeFormat("tr-TR", {
  day: "numeric",
  month: "long",
  year: "numeric",
  timeZone: "Europe/Istanbul",
});

export function PostMeta({ post }: { post: Post }) {
  const authorNames = [...post.authors]
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map(({ author }) => author.name)
    .join(", ");

  return (
    <div className="flex flex-wrap gap-x-3 gap-y-1 text-sm text-muted-foreground">
      <span>{authorNames}</span>
      <span aria-hidden="true">/</span>
      <time dateTime={post.publishedAt}>
        {dateFormatter.format(new Date(post.publishedAt))}
      </time>
    </div>
  );
}
