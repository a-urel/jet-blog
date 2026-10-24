import type { Metadata } from "next";
import Link from "next/link";
import { CircleAlert, Eye, FilePlus2, Pencil } from "lucide-react";
import { getFormatter, getTranslations } from "next-intl/server";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { listAdminPosts } from "@/features/posts/admin/data";
import { canEditPost } from "@/features/posts/admin/permissions";
import { getEditorialContext } from "@/lib/auth/editorial";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("adminPosts");

  return { title: t("list.title") };
}

export default async function AdminPostsPage() {
  const { user, membership } = await getEditorialContext();

  if (!user || !membership) return null;

  const [{ posts, error }, t, format] = await Promise.all([
    listAdminPosts(),
    getTranslations("adminPosts"),
    getFormatter(),
  ]);

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-2">
          <h1 className="text-3xl font-semibold tracking-tight">{t("list.title")}</h1>
          <p className="text-muted-foreground">
            {t("list.description")}
          </p>
        </div>
        <Button asChild>
          <Link href="/admin/posts/new">
            <FilePlus2 aria-hidden="true" />
            {t("list.newDraft")}
          </Link>
        </Button>
      </div>

      {error ? (
        <p
          role="alert"
          className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive"
        >
          <CircleAlert aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
          {t("list.loadError")}
        </p>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>{t("list.cardTitle")}</CardTitle>
          <CardDescription>
            {t("list.cardDescription")}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {!error && posts.length === 0 ? (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">
                {t("list.empty")}
              </p>
              <Button asChild variant="outline" size="sm">
                <Link href="/admin/posts/new">{t("list.createFirst")}</Link>
              </Button>
            </div>
          ) : null}

          {!error && posts.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[52rem] border-collapse text-sm">
                <thead>
                  <tr className="border-b text-left text-muted-foreground">
                    <th className="py-2 pr-4 font-medium">{t("list.columns.title")}</th>
                    <th className="py-2 pr-4 font-medium">{t("list.columns.status")}</th>
                    <th className="py-2 pr-4 font-medium">{t("list.columns.category")}</th>
                    <th className="py-2 pr-4 font-medium">{t("list.columns.authors")}</th>
                    <th className="py-2 pr-4 font-medium">{t("list.columns.updated")}</th>
                    <th className="py-2 font-medium">{t("list.columns.actions")}</th>
                  </tr>
                </thead>
                <tbody>
                  {posts.map((post) => {
                    const editable = canEditPost(
                      post,
                      membership,
                      user.id,
                    );

                    return (
                      <tr
                        key={post.id}
                        className="border-b align-top last:border-b-0"
                      >
                        <td className="py-3 pr-4">
                          <p className="font-medium">{post.title}</p>
                          <p className="text-muted-foreground">/{post.slug}</p>
                        </td>
                        <td className="py-3 pr-4">
                          <Badge
                            variant={
                              post.status === "published"
                                ? "default"
                                : "secondary"
                            }
                          >
                            {t(`status.${post.status}`)}
                          </Badge>
                        </td>
                        <td className="py-3 pr-4">
                          {post.categoryName ?? (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </td>
                        <td className="py-3 pr-4">
                          {post.authorNames.length > 0
                            ? post.authorNames.join(", ")
                            : t("list.noAuthors")}
                        </td>
                        <td className="py-3 pr-4 text-muted-foreground">
                          {format.dateTime(new Date(post.updatedAt), "dateTimeShort")}
                        </td>
                        <td className="py-3">
                          <div className="flex flex-wrap items-center gap-2">
                            {editable ? (
                              <Button asChild variant="outline" size="sm">
                                <Link href={`/admin/posts/${post.id}`}>
                                  <Pencil aria-hidden="true" />
                                  {t("shared.edit")}
                                </Link>
                              </Button>
                            ) : null}
                            <Button asChild variant="ghost" size="sm">
                              <Link href={`/admin/posts/${post.id}/preview`}>
                                <Eye aria-hidden="true" />
                                {t("shared.preview")}
                              </Link>
                            </Button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : null}
        </CardContent>
      </Card>

      <p className="text-sm text-muted-foreground">
        {t("list.footnote")}
      </p>
    </div>
  );
}
