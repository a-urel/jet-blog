import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CircleAlert, ExternalLink, FileText } from "lucide-react";
import { getFormatter, getTranslations } from "next-intl/server";

import { QueryStatusToast } from "@/components/status/query-status";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { pageAccessDenial } from "@/features/pages/admin/components/page-admin-guard";
import { PageForm } from "@/features/pages/admin/components/page-form";
import { PageStateControl } from "@/features/pages/admin/components/page-state-control";
import { getAdminPage } from "@/features/pages/admin/data";
import { parsePageActionErrorKey } from "@/features/pages/admin/errors";
import { staticPagePath } from "@/features/pages/model";
import { currentContentVersion, validateBodyDocument } from "@/features/posts/content/schema";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("adminPages");
  return { title: t("editPage.metaTitle") };
}

// ?status= values after a successful save or state change.
const successStatuses = ["created", "updated", "published", "unpublished"] as const;

function isSuccessStatus(value: unknown): value is (typeof successStatuses)[number] {
  return successStatuses.includes(value as (typeof successStatuses)[number]);
}

export default async function EditStaticPage({
  params,
  searchParams,
}: PageProps<"/[locale]/admin/pages/[id]">) {
  const denial = await pageAccessDenial();
  if (denial) return denial;

  const { id } = await params;
  const [{ page, error }, { status, error: errorValue }, t, format] = await Promise.all([
    getAdminPage(id),
    searchParams,
    getTranslations("adminPages"),
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
          <CardDescription>{t("editPage.loadErrorDescription")}</CardDescription>
        </CardHeader>
        <CardContent>
          <Button asChild variant="outline">
            <Link href="/admin/pages">{t("editPage.backToPages")}</Link>
          </Button>
        </CardContent>
      </Card>
    );
  }

  if (!page) notFound();

  const published = page.status === "published";
  const bodyValidation =
    page.contentVersion === currentContentVersion ? validateBodyDocument(page.body) : null;
  const editableBody = bodyValidation?.ok ? bodyValidation.doc : null;
  const errorKey = parsePageActionErrorKey(errorValue);

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <p className="text-sm text-muted-foreground">
          <Link href="/admin/pages" className="underline-offset-4 hover:underline">
            {t("list.title")}
          </Link>{" "}
          / {page.title}
        </p>
        <h1 className="flex flex-wrap items-center gap-3 text-3xl font-semibold tracking-tight">
          <FileText aria-hidden="true" className="size-7" />
          {page.title}
          <Badge variant={published ? "default" : "secondary"}>{t(`statusLabel.${page.status}`)}</Badge>
          {page.kind !== "other" ? <Badge variant="outline">{t(`kinds.${page.kind}`)}</Badge> : null}
        </h1>
        <p className="text-sm text-muted-foreground">
          {t("editPage.revisionLine", {
            revision: String(page.revision),
            updatedAt: format.dateTime(new Date(page.updatedAt), "dateTimeShort"),
          })}
        </p>
      </div>

      {isSuccessStatus(status) ? <QueryStatusToast message={t(`status.${status}`)} /> : null}

      {errorKey ? (
        <p
          role="alert"
          className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive"
        >
          {t(`errors.${errorKey}`)}
        </p>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>{t("editPage.publicationTitle")}</CardTitle>
          <CardDescription>
            {published && page.publishedAt
              ? t("editPage.publishedDescription", {
                  publishedAt: format.dateTime(new Date(page.publishedAt), "dateTimeShort"),
                })
              : t("editPage.draftDescription")}
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-3">
          {published ? (
            <>
              <PageStateControl action="unpublish" pageId={page.id} revision={page.revision} title={page.title} />
              <Button asChild variant="ghost">
                <Link href={staticPagePath(page.slug)}>
                  <ExternalLink aria-hidden="true" />
                  {t("editPage.openPublicPage")}
                </Link>
              </Button>
            </>
          ) : (
            <>
              <PageStateControl action="publish" pageId={page.id} revision={page.revision} title={page.title} />
              <PageStateControl action="delete" pageId={page.id} revision={page.revision} title={page.title} />
            </>
          )}
        </CardContent>
      </Card>

      {editableBody ? (
        <Card>
          <CardHeader>
            <CardTitle>{t("editPage.formCardTitle")}</CardTitle>
            <CardDescription>
              {published ? t("editPage.formCardPublishedDescription") : t("editPage.formCardDescription")}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {/* Keyed by revision so a save or state change reloads the
                uncontrolled fields and the editor. */}
            <PageForm
              key={page.revision}
              mode="edit"
              pageId={page.id}
              revision={page.revision}
              published={published}
              initialValues={{
                title: page.title,
                slug: page.slug,
                metaDescription: page.metaDescription ?? "",
                kind: page.kind,
                body: editableBody,
              }}
            />
          </CardContent>
        </Card>
      ) : (
        // Opening an unsupported document would drop content on save.
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CircleAlert aria-hidden="true" className="size-5" />
              {t("editPage.unsupportedTitle")}
            </CardTitle>
            <CardDescription>
              {t("editPage.unsupportedDescription", { version: String(page.contentVersion) })}
            </CardDescription>
          </CardHeader>
        </Card>
      )}
    </div>
  );
}
