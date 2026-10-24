import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft, Bookmark, CircleAlert } from "lucide-react";
import { getTranslations } from "next-intl/server";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { SupabaseNotConfigured } from "@/features/auth/components/auth-page-shell";
import { signInPathFor } from "@/features/auth/return-path";
import { BookmarkProvider } from "@/features/bookmarks/components/bookmark-provider";
import { BookmarkToggle } from "@/features/bookmarks/components/bookmark-toggle";
import { listSavedPosts } from "@/features/bookmarks/data";
import { postPath } from "@/features/posts/archives";
import { PostMeta } from "@/features/posts/components/post-meta";
import type { PostSummary } from "@/features/posts/types";
import { getSessionUser } from "@/lib/auth/session";
import { isSupabaseConfigured } from "@/lib/supabase/env";

// Private and per-user: the session cookie makes this route dynamic, the
// account layout sets noindex, and nothing here is prerendered or cached.
export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("bookmarks.savedPage");
  return { title: t("metaTitle") };
}

export default async function SavedPostsPage() {
  const t = await getTranslations("bookmarks.savedPage");
  const tCommon = await getTranslations("common");

  if (!isSupabaseConfigured()) {
    return (
      <SavedShell>
        <SupabaseNotConfigured action={t("notConfiguredAction")} />
      </SavedShell>
    );
  }

  const user = await getSessionUser();
  if (!user) redirect(signInPathFor("/account/saved"));

  let posts: PostSummary[] | null = null;
  try {
    posts = await listSavedPosts(user.id);
  } catch {
    posts = null;
  }

  return (
    <SavedShell>
      {posts === null ? (
        <Card role="alert">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CircleAlert aria-hidden="true" className="size-5 text-destructive" />
              {t("loadErrorTitle")}
            </CardTitle>
            <CardDescription>
              {t("loadErrorDescription")}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild variant="outline">
              <Link href="/account/saved">{tCommon("error.retry")}</Link>
            </Button>
          </CardContent>
        </Card>
      ) : posts.length === 0 ? (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Bookmark aria-hidden="true" className="size-5" />
              {t("emptyTitle")}
            </CardTitle>
            <CardDescription>
              {t("emptyDescription")}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild variant="outline">
              <Link href="/">{t("browse")}</Link>
            </Button>
          </CardContent>
        </Card>
      ) : (
        <BookmarkProvider
          postIds={posts.map((post) => post.id)}
          initialSavedIds={posts.map((post) => post.id)}
        >
          <ul className="space-y-4">
            {posts.map((post) => (
              <li key={post.id}>
                <Card className="gap-4">
                  <CardHeader className="gap-3">
                    <p className="text-sm font-medium text-muted-foreground">
                      {post.category.name}
                    </p>
                    <h2 className="text-xl leading-snug font-semibold tracking-tight">
                      <Link
                        href={postPath(post.slug)}
                        className="rounded-sm hover:underline underline-offset-4"
                      >
                        {post.title}
                      </Link>
                    </h2>
                    <PostMeta post={post} />
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {post.excerpt ? (
                      <p className="leading-relaxed text-muted-foreground">{post.excerpt}</p>
                    ) : null}
                    <BookmarkToggle postId={post.id} postTitle={post.title} />
                  </CardContent>
                </Card>
              </li>
            ))}
          </ul>
        </BookmarkProvider>
      )}
    </SavedShell>
  );
}

async function SavedShell({ children }: { children: React.ReactNode }) {
  const t = await getTranslations("bookmarks.savedPage");
  const tCommon = await getTranslations("common.layout");

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6 px-6 py-16 sm:py-24">
      <div className="space-y-3">
        <Button asChild variant="ghost" className="-ml-3 self-start">
          <Link href="/account">
            <ArrowLeft aria-hidden="true" /> {tCommon("account")}
          </Link>
        </Button>
        <p className="text-sm font-medium text-muted-foreground">{t("eyebrow")}</p>
        <h1 className="text-3xl font-semibold tracking-tight">{t("heading")}</h1>
        <p className="text-muted-foreground">
          {t("intro")}
        </p>
      </div>
      {children}
    </div>
  );
}
