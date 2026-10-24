import Link from "next/link";

import { archivePaths, postPath } from "@/features/posts/archives";
import { PostMeta } from "@/features/posts/components/post-meta";
import type { HighlightSegment } from "../query";
import type { SearchResult } from "../results";

// Highlighted text from ts_headline, rendered as React text nodes inside
// <mark>. The segments are plain text (see parseHighlight); no HTML from the
// database is ever interpreted.
function Highlighted({ segments }: { segments: HighlightSegment[] }) {
  return segments.map((segment, index) =>
    segment.match ? (
      <mark key={index} className="rounded-sm bg-primary/15 px-0.5 font-medium text-foreground">
        {segment.text}
      </mark>
    ) : (
      <span key={index}>{segment.text}</span>
    ),
  );
}

export function SearchResults({ results }: { results: SearchResult[] }) {
  return (
    <ol className="divide-y border-y">
      {results.map(({ post, title, snippet }) => (
        <li key={post.id} className="space-y-3 py-6">
          <Link
            href={archivePaths.category(post.category.slug)}
            className="rounded-sm text-sm font-medium text-muted-foreground hover:text-foreground hover:underline underline-offset-4"
          >
            {post.category.name}
          </Link>
          <h2 className="text-xl leading-snug font-semibold tracking-tight">
            <Link
              href={postPath(post.slug)}
              lang={post.language}
              className="rounded-sm hover:underline underline-offset-4"
            >
              <Highlighted segments={title} />
            </Link>
          </h2>
          <PostMeta post={post} />
          {snippet.length > 0 ? (
            <p lang={post.language} className="max-w-3xl leading-relaxed text-muted-foreground">
              <Highlighted segments={snippet} />
            </p>
          ) : null}
        </li>
      ))}
    </ol>
  );
}
