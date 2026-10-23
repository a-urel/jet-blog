import type { ReactNode } from "react";

import type { PostSummary } from "../types";
import { PostList } from "./post-list";

// Shared frame for the category, tag, and author archive pages.
export function ArchiveLayout({
  eyebrow,
  title,
  description,
  children,
  posts,
}: {
  eyebrow: string;
  title: string;
  description?: string | null;
  children?: ReactNode;
  posts: PostSummary[];
}) {
  return (
    <div className="mx-auto max-w-5xl px-6 py-12 sm:py-20">
      <header className="mb-12 max-w-2xl space-y-4">
        <p className="text-sm font-medium text-muted-foreground">{eyebrow}</p>
        <h1 className="text-4xl leading-tight font-semibold tracking-tight sm:text-5xl">
          {title}
        </h1>
        {description ? (
          <p className="text-lg leading-relaxed text-muted-foreground">{description}</p>
        ) : null}
        {children}
      </header>
      <section aria-labelledby="archive-posts-title">
        <div className="mb-6 flex items-baseline justify-between gap-4 border-b pb-4">
          <h2 id="archive-posts-title" className="text-xl font-semibold">Yazılar</h2>
          <span className="text-sm text-muted-foreground">{posts.length} yazı</span>
        </div>
        <PostList posts={posts} />
      </section>
    </div>
  );
}
