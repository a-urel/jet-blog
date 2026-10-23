import Link from "next/link";
import { ArrowRight } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter, CardHeader } from "@/components/ui/card";
import { BookmarkProvider } from "@/features/bookmarks/components/bookmark-provider";
import { BookmarkToggle } from "@/features/bookmarks/components/bookmark-toggle";
import { archivePaths, postPath } from "../archives";
import type { PostSummary } from "../types";
import { PostMeta } from "./post-meta";

// Card grid shared by the home listing and the category, tag, and author
// archives. Every card links to the canonical /posts/[slug] URL. Bookmark
// state loads in the browser (BookmarkProvider), so the list stays shared ISR
// output.
export function PostList({
  posts,
  headingLevel = 3,
}: {
  posts: PostSummary[];
  headingLevel?: 2 | 3;
}) {
  const Heading = headingLevel === 2 ? "h2" : "h3";

  return (
    <BookmarkProvider postIds={posts.map((post) => post.id)}>
      <div className="grid gap-6 md:grid-cols-2">
        {posts.map((post, index) => (
          <article key={post.id} className={index === 0 ? "md:col-span-2" : ""}>
            <Card className="h-full gap-5 p-2">
              <CardHeader className="gap-4 pt-4">
                <Link
                  href={archivePaths.category(post.category.slug)}
                  className="self-start rounded-sm text-sm font-medium text-muted-foreground hover:text-foreground hover:underline underline-offset-4"
                >
                  {post.category.name}
                </Link>
                <Heading className="text-2xl leading-snug font-semibold tracking-tight">
                  <Link href={postPath(post.slug)} className="rounded-sm hover:underline underline-offset-4">
                    {post.title}
                  </Link>
                </Heading>
                <PostMeta post={post} />
              </CardHeader>
              <CardContent className="flex-1 space-y-5">
                {post.excerpt ? (
                  <p className="max-w-2xl leading-relaxed text-muted-foreground">
                    {post.excerpt}
                  </p>
                ) : null}
                {post.tags.length > 0 ? (
                  <ul aria-label="Etiketler" className="flex flex-wrap gap-2">
                    {post.tags.map((tag) => (
                      <li key={tag.id}>
                        <Badge asChild variant="secondary">
                          <Link href={archivePaths.tag(tag.slug)}>{tag.name}</Link>
                        </Badge>
                      </li>
                    ))}
                  </ul>
                ) : null}
              </CardContent>
              <CardFooter className="flex-wrap items-start justify-between gap-3 bg-transparent">
                <BookmarkToggle postId={post.id} postTitle={post.title} />
                <Button asChild variant="ghost">
                  <Link href={postPath(post.slug)} aria-label={`${post.title} — yazıyı oku`}>
                    Yazıyı oku <ArrowRight aria-hidden="true" />
                  </Link>
                </Button>
              </CardFooter>
            </Card>
          </article>
        ))}
      </div>
    </BookmarkProvider>
  );
}
