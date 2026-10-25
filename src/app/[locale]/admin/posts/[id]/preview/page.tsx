import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, CircleAlert, Eye, Pencil } from "lucide-react";
import { getLocale, getTranslations } from "next-intl/server";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { getAdminPostDetail } from "@/features/posts/admin/data";
import { canEditPost } from "@/features/posts/admin/permissions";
import { PostBody } from "@/features/posts/components/post-body";
import { PostCover } from "@/features/posts/components/post-cover";
import { postLanguageLabel } from "@/features/posts/language";
import { getEditorialContext } from "@/lib/auth/editorial";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("adminPosts");

  return {
    title: t("preview.metaTitle"),
    robots: { index: false, follow: false },
  };
}

// Preview reads a draft through the caller's session and must never be served
// from a public cache.
export const dynamic = "force-dynamic";

export default async function PostPreviewPage({
  params,
}: PageProps<"/[locale]/admin/posts/[id]/preview">) {
  const { id } = await params;
  const { user, membership } = await getEditorialContext();

  if (!user || !membership) return null;

  const [{ post, error }, t, locale] = await Promise.all([
    getAdminPostDetail(id),
    getTranslations("adminPosts"),
    getLocale(),
  ]);

  if (error) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CircleAlert aria-hidden="true" className="size-5" />
            {t("preview.loadErrorTitle")}
          </CardTitle>
          <CardDescription>{t("shared.loadErrorDescription")}</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  if (!post) notFound();

  const editable = canEditPost(post, membership, user.id);

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Button asChild variant="ghost" size="sm">
          <Link href="/admin/posts">
            <ArrowLeft aria-hidden="true" />
            {t("shared.backToPosts")}
          </Link>
        </Button>
        <div className="flex items-center gap-2">
          <Badge variant="outline">
            <Eye aria-hidden="true" />
            {t("preview.badge")}
          </Badge>
          {editable ? (
            <Button asChild variant="outline" size="sm">
              <Link href={`/admin/posts/${post.id}`}>
                <Pencil aria-hidden="true" />
                {t("shared.edit")}
              </Link>
            </Button>
          ) : null}
        </div>
      </div>

      {post.status === "draft" ? (
        <p className="rounded-lg border border-amber-600/40 bg-amber-600/10 px-3 py-2 text-sm text-amber-900 dark:text-amber-200">
          {t("preview.draftNotice")}
        </p>
      ) : post.hasUnpublishedChanges ? (
        <p className="rounded-lg border border-amber-600/40 bg-amber-600/10 px-3 py-2 text-sm text-amber-900 dark:text-amber-200">
          {t("preview.workingCopyNotice")}
        </p>
      ) : null}

      <article className="mx-auto max-w-3xl space-y-8">
        <header className="space-y-5 border-b pb-8">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant={post.status === "published" ? "default" : "secondary"}>
              {t(`status.${post.status}`)}
            </Badge>
            <Badge variant="outline">{postLanguageLabel(post.language, locale)}</Badge>
            {post.categoryName ? (
              <Badge variant="outline">{post.categoryName}</Badge>
            ) : (
              <Badge variant="outline">{t("preview.noCategory")}</Badge>
            )}
            {post.tagNames.map((tag) => (
              <Badge key={tag} variant="secondary">
                {tag}
              </Badge>
            ))}
          </div>
          <h1
            lang={post.language}
            className="text-3xl leading-tight font-semibold tracking-tight sm:text-5xl"
          >
            {post.title}
          </h1>
          {post.excerpt ? (
            <p lang={post.language} className="text-lg leading-relaxed text-muted-foreground">
              {post.excerpt}
            </p>
          ) : null}
          <div className="space-y-1 text-sm">
            <p className="font-medium">{t("preview.authors")}</p>
            {post.credits.length > 0 ? (
              <ol className="space-y-1 text-muted-foreground">
                {post.credits.map((credit) => (
                  <li key={credit.authorId}>
                    {credit.sortOrder + 1}. {credit.authorName}
                  </li>
                ))}
              </ol>
            ) : (
              <p className="text-muted-foreground">{t("preview.noAuthors")}</p>
            )}
          </div>
          <p className="text-sm text-muted-foreground">
            {t("preview.revisionLine", {
              revision: String(post.revision),
              slug: post.slug,
            })}
          </p>
          {post.coverMediaId ? (
            <div className="space-y-2">
              <PostCover
                mediaId={post.coverMediaId}
                alt={post.coverAlt ?? ""}
                sizes="(min-width: 768px) 45rem, 100vw"
                className="rounded-xl"
              />
              {post.coverAlt ? null : (
                <p className="text-sm text-amber-900 dark:text-amber-200">
                  {t("preview.coverAltMissing")}
                </p>
              )}
            </div>
          ) : null}
        </header>

        <div lang={post.language}>
          <PostBody body={post.body} contentVersion={post.contentVersion} />
        </div>
      </article>
    </div>
  );
}
