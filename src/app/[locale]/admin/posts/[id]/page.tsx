import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  CircleAlert,
  ExternalLink,
  Eye,
  FileText,
  LockKeyhole,
} from "lucide-react";
import { getFormatter, getTranslations } from "next-intl/server";

import { QueryStatusToast } from "@/components/status/query-status";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { listMedia } from "@/features/media/data";
import { PostForm } from "@/features/posts/admin/components/post-form";
import { PublicationControl } from "@/features/posts/admin/components/publication-control";
import {
  getAdminPostDetail,
  listTaxonomyOptions,
} from "@/features/posts/admin/data";
import {
  canDiscardChanges,
  canEditPost,
  canPublishPosts,
} from "@/features/posts/admin/permissions";
import {
  availablePublicationActions,
  publicationErrorMessageKey,
} from "@/features/posts/admin/publication";
import {
  currentContentVersion,
  validateBodyDocument,
} from "@/features/posts/content/schema";
import { getEditorialContext } from "@/lib/auth/editorial";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("adminPosts");

  return { title: t("editPage.metaTitle") };
}

// ?status= values after a successful save or publication change; each has a
// message under adminPosts.editPage.success.
const successStatuses = [
  "created",
  "updated",
  "published",
  "unpublished",
  "republished",
  "discarded",
] as const;

type SuccessStatus = (typeof successStatuses)[number];

function isSuccessStatus(value: unknown): value is SuccessStatus {
  return successStatuses.includes(value as SuccessStatus);
}

export default async function EditPostPage({
  params,
  searchParams,
}: PageProps<"/[locale]/admin/posts/[id]">) {
  const { id } = await params;
  const { user, membership } = await getEditorialContext();

  if (!user || !membership) return null;

  const [{ post, error }, taxonomy, mediaLibrary, t, format] = await Promise.all([
    getAdminPostDetail(id),
    listTaxonomyOptions(),
    listMedia(),
    getTranslations("adminPosts"),
    getFormatter(),
  ]);

  if (error) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CircleAlert aria-hidden="true" className="size-5" />
            {t("editPage.loadErrorTitle")}
          </CardTitle>
          <CardDescription>{t("shared.loadErrorDescription")}</CardDescription>
        </CardHeader>
        <CardContent>
          <Button asChild variant="outline">
            <Link href="/admin/posts">{t("shared.backToPosts")}</Link>
          </Button>
        </CardContent>
      </Card>
    );
  }

  if (!post) notFound();

  const editable = canEditPost(post, membership, user.id);
  const bodyValidation =
    post.contentVersion === currentContentVersion
      ? validateBodyDocument(post.body)
      : null;
  const editableBody = bodyValidation?.ok ? bodyValidation.doc : null;
  const { status, error: errorKey } = await searchParams;
  const successMessage = isSuccessStatus(status)
    ? t(`editPage.success.${status}`)
    : null;
  const errorMessageKey = publicationErrorMessageKey(errorKey);
  const errorMessage = errorMessageKey
    ? t(`publication.errors.${errorMessageKey}`)
    : null;
  const canPublish = canPublishPosts(membership);
  const published = post.status === "published";
  const publicationActions = availablePublicationActions({
    published,
    hasUnpublishedChanges: post.hasUnpublishedChanges,
    canPublish,
    canDiscard: canDiscardChanges(post, membership, user.id),
  });
  // The public page lives at the published slug; a changed working-copy slug
  // takes over only on republish.
  const publicHref = `/posts/${post.published?.slug ?? post.slug}`;
  const previewHref = `/admin/posts/${post.id}/preview`;

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <p className="text-sm text-muted-foreground">
          <Link href="/admin/posts" className="underline-offset-4 hover:underline">
            {t("shared.posts")}
          </Link>{" "}
          / {post.title}
        </p>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="space-y-2">
            <h1 className="flex flex-wrap items-center gap-3 text-3xl font-semibold tracking-tight">
              <FileText aria-hidden="true" className="size-7" />
              {post.title}
              <Badge variant={post.status === "published" ? "default" : "secondary"}>
                {t(`status.${post.status}`)}
              </Badge>
              {post.hasUnpublishedChanges ? (
                <Badge variant="outline">{t("status.unpublishedChanges")}</Badge>
              ) : null}
            </h1>
            <p className="text-sm text-muted-foreground">
              {t("editPage.revisionLine", {
                revision: String(post.revision),
                updatedAt: format.dateTime(new Date(post.updatedAt), "dateTimeShort"),
              })}
            </p>
          </div>
          <Button asChild variant="outline">
            <Link href={previewHref}>
              <Eye aria-hidden="true" />
              {t("editPage.memberPreview")}
            </Link>
          </Button>
        </div>
      </div>

      {successMessage ? <QueryStatusToast message={successMessage} /> : null}

      {errorMessage ? (
        <p
          role="alert"
          className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive"
        >
          {errorMessage}
        </p>
      ) : null}

      {canPublish || (published && editable) ? (
        <Card>
          <CardHeader>
            <CardTitle>{t("editPage.publicationTitle")}</CardTitle>
            <CardDescription>
              {!published
                ? t("editPage.draftDescription")
                : post.hasUnpublishedChanges && post.published
                  ? canPublish
                    ? t("editPage.unpublishedChangesDescription", {
                        version: String(post.published.version),
                        updatedAt: format.dateTime(
                          new Date(post.published.updatedAt),
                          "dateTimeShort",
                        ),
                      })
                    : t("editPage.authorUnpublishedChangesDescription")
                  : post.publishedAt
                    ? t("editPage.publishedAtDescription", {
                        publishedAt: format.dateTime(
                          new Date(post.publishedAt),
                          "dateTimeShort",
                        ),
                      })
                    : t("editPage.publishedDescription")}
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-3">
            {publicationActions.map((action) => (
              <PublicationControl
                key={action}
                action={action}
                postId={post.id}
                revision={post.revision}
                title={post.title}
              />
            ))}
            {published ? (
              <Button asChild variant="ghost">
                <Link href={publicHref}>
                  <ExternalLink aria-hidden="true" />
                  {t("editPage.openPublicPage")}
                </Link>
              </Button>
            ) : null}
          </CardContent>
        </Card>
      ) : null}

      {!editable ? (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <LockKeyhole aria-hidden="true" className="size-5" />
              {t("editPage.readOnlyTitle")}
            </CardTitle>
            <CardDescription>
              {t("editPage.readOnlyDescription")}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild variant="outline">
              <Link href={previewHref}>{t("shared.openMemberPreview")}</Link>
            </Button>
          </CardContent>
        </Card>
      ) : !editableBody ? (
        // Opening an unsupported document in the editor would drop the content
        // it cannot represent on the next save, so the form stays closed.
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CircleAlert aria-hidden="true" className="size-5" />
              {t("editPage.unsupportedTitle")}
            </CardTitle>
            <CardDescription>
              {t("editPage.unsupportedDescription", {
                version: String(post.contentVersion),
              })}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild variant="outline">
              <Link href={previewHref}>{t("shared.openMemberPreview")}</Link>
            </Button>
          </CardContent>
        </Card>
      ) : taxonomy.error ? (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CircleAlert aria-hidden="true" className="size-5" />
              {t("shared.optionsErrorTitle")}
            </CardTitle>
            <CardDescription>
              {t("shared.optionsErrorDescription")}
            </CardDescription>
          </CardHeader>
        </Card>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>{t("editPage.formCardTitle")}</CardTitle>
            <CardDescription>
              {published
                ? t("editPage.formCardPublishedDescription")
                : t("editPage.formCardDescription")}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {/* Keyed by revision: discarding changes reloads this route with
                new values, and the form's uncontrolled fields and client state
                would otherwise keep the discarded ones. */}
            <PostForm
              key={post.revision}
              mode="edit"
              postId={post.id}
              revision={post.revision}
              categories={taxonomy.categories}
              tags={taxonomy.tags}
              authors={taxonomy.authors}
              media={mediaLibrary.media}
              mediaError={mediaLibrary.error}
              initialValues={{
                title: post.title,
                slug: post.slug,
                excerpt: post.excerpt ?? "",
                categoryId: post.categoryId ?? "",
                language: post.language,
                coverMediaId: post.coverMediaId ?? "",
                coverAlt: post.coverAlt ?? "",
                tagIds: post.tagIds,
                credits: post.credits.map((credit) => ({
                  authorId: credit.authorId,
                  authorName: credit.authorName,
                })),
                body: editableBody,
              }}
            />
          </CardContent>
        </Card>
      )}
    </div>
  );
}
