"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { CircleAlert, RotateCcw } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";
import { PostBodyEditor } from "@/features/posts/admin/components/post-body-editor";
import { useUnsavedChangesWarning } from "@/features/posts/admin/components/use-unsaved-changes-warning";
import {
  maxPageMetaDescriptionLength,
  maxPageSlugLength,
  maxPageTitleLength,
  pageKinds,
  type PageFormValues,
} from "../../model";
import { createPageAction, updatePageAction, type PageFormState } from "../actions";

const initialState: PageFormState = { status: "idle", message: null, fieldErrors: {} };

type PageFormProps = {
  mode: "create" | "edit";
  pageId?: string;
  revision?: number;
  // A published page has one copy: saving it changes the public page.
  published?: boolean;
  initialValues: PageFormValues;
};

function FieldError({ id, message }: { id: string; message?: string }) {
  if (!message) return null;

  return (
    <p id={id} className="text-sm text-destructive">
      {message}
    </p>
  );
}

// Page editor: the post body editor without author credits, taxonomy, cover,
// or language. Errors stay inline; a successful save redirects with ?status=
// and the page shows a toast.
export function PageForm({ mode, pageId, revision, published = false, initialValues }: PageFormProps) {
  const t = useTranslations("adminPages");
  const [state, formAction, pending] = useActionState(
    mode === "create" ? createPageAction : updatePageAction,
    initialState,
  );
  // Same dirty tracking as the post form: a successful save re-renders with a
  // newer revision, which clears the warning.
  const [editedRevision, setEditedRevision] = useState<number | null>(null);
  const dirty = editedRevision !== null && editedRevision === (revision ?? 0);
  useUnsavedChangesWarning(dirty);

  function markDirty() {
    setEditedRevision(revision ?? 0);
  }

  const values = state.values ?? initialValues;
  const reloadHref = mode === "edit" && pageId ? `/admin/pages/${pageId}` : "/admin/pages";

  return (
    <form action={formAction} onChange={markDirty} className="max-w-3xl space-y-8">
      {mode === "edit" && pageId ? (
        <>
          <input type="hidden" name="pageId" value={pageId} />
          <input type="hidden" name="revision" value={revision ?? ""} />
        </>
      ) : null}

      {state.status === "conflict" && state.message ? (
        <div
          role="alert"
          className="space-y-3 rounded-lg border border-amber-600/40 bg-amber-600/10 px-3 py-3 text-sm text-amber-900 dark:text-amber-200"
        >
          <p className="flex items-start gap-2">
            <CircleAlert aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
            {state.message}
          </p>
          <Button asChild variant="outline" size="sm">
            <Link href={reloadHref}>
              <RotateCcw aria-hidden="true" />
              {t("form.openCurrentVersion")}
            </Link>
          </Button>
        </div>
      ) : null}

      {state.status === "error" && state.message ? (
        <p
          role="alert"
          className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive"
        >
          <CircleAlert aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
          {state.message}
        </p>
      ) : null}

      <div className="space-y-2">
        <Label htmlFor="page-title">{t("form.title")}</Label>
        <Input
          id="page-title"
          name="title"
          required
          maxLength={maxPageTitleLength}
          defaultValue={values.title}
          aria-invalid={state.fieldErrors.title ? true : undefined}
          aria-describedby={state.fieldErrors.title ? "page-title-error" : undefined}
        />
        <FieldError id="page-title-error" message={state.fieldErrors.title} />
      </div>

      <div className="space-y-2">
        <Label htmlFor="page-slug">{t("form.slug")}</Label>
        <Input
          id="page-slug"
          name="slug"
          maxLength={maxPageSlugLength}
          defaultValue={values.slug}
          spellCheck={false}
          aria-invalid={state.fieldErrors.slug ? true : undefined}
          aria-describedby="page-slug-help page-slug-error"
        />
        <p id="page-slug-help" className="text-sm text-muted-foreground">
          {t("form.slugHelp")}
        </p>
        <FieldError id="page-slug-error" message={state.fieldErrors.slug} />
      </div>

      <div className="space-y-2">
        <Label htmlFor="page-kind">{t("form.kind")}</Label>
        <NativeSelect
          id="page-kind"
          name="kind"
          className="w-full sm:w-80"
          defaultValue={values.kind}
          aria-invalid={state.fieldErrors.kind ? true : undefined}
          aria-describedby="page-kind-help page-kind-error"
        >
          {pageKinds.map((kind) => (
            <NativeSelectOption key={kind} value={kind}>
              {t(`kinds.${kind}`)}
            </NativeSelectOption>
          ))}
        </NativeSelect>
        <p id="page-kind-help" className="text-sm text-muted-foreground">
          {t("form.kindHelp")}
        </p>
        <FieldError id="page-kind-error" message={state.fieldErrors.kind} />
      </div>

      <div className="space-y-2">
        <Label htmlFor="page-meta-description">{t("form.metaDescription")}</Label>
        <Textarea
          id="page-meta-description"
          name="metaDescription"
          rows={3}
          maxLength={maxPageMetaDescriptionLength}
          defaultValue={values.metaDescription}
          aria-invalid={state.fieldErrors.metaDescription ? true : undefined}
          aria-describedby="page-meta-help page-meta-error"
        />
        <p id="page-meta-help" className="text-sm text-muted-foreground">
          {t("form.metaDescriptionHelp")}
        </p>
        <FieldError id="page-meta-error" message={state.fieldErrors.metaDescription} />
      </div>

      <div className="space-y-2">
        <p id="page-body-label" className="text-sm font-medium">
          {t("form.body")}
        </p>
        <PostBodyEditor
          id="page-body"
          labelId="page-body-label"
          initialContent={initialValues.body}
          invalid={Boolean(state.fieldErrors.body)}
          describedBy="page-body-error"
          onChange={markDirty}
        />
        <FieldError id="page-body-error" message={state.fieldErrors.body} />
      </div>

      {published ? (
        <p className="flex items-start gap-2 rounded-lg border px-3 py-2 text-sm text-muted-foreground">
          <CircleAlert aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
          {t("form.liveWarning")}
        </p>
      ) : null}

      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" disabled={pending}>
          {pending ? t("form.saving") : mode === "create" ? t("form.create") : t("form.save")}
        </Button>
        <Button asChild variant="ghost">
          <Link href="/admin/pages">{t("form.cancel")}</Link>
        </Button>
      </div>
    </form>
  );
}
