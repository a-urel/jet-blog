"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import {
  ArrowDown,
  ArrowUp,
  CircleAlert,
  Plus,
  RotateCcw,
  Trash2,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  NativeSelect,
  NativeSelectOption,
} from "@/components/ui/native-select";
import {
  createDraftPostAction,
  updatePostMetadataAction,
  type PostFormState,
} from "@/features/posts/admin/actions";
import type {
  AuthorOption,
  CategoryOption,
  CoverMediaOption,
  TagOption,
} from "@/features/posts/admin/types";
import type { BodyDocument } from "@/features/posts/content/schema";
import type { PostLanguage } from "@/features/posts/language";
import { PostBodyEditor } from "./post-body-editor";
import { PostCoverField } from "./post-cover-field";
import { PostLanguagePicker } from "./post-language-picker";
import { useUnsavedChangesWarning } from "./use-unsaved-changes-warning";

const initialState: PostFormState = {
  status: "idle",
  message: null,
  fieldErrors: {},
};

type InitialCredit = {
  authorId: string;
  authorName: string;
};

type PostFormProps = {
  mode: "create" | "edit";
  postId?: string;
  revision?: number;
  categories: CategoryOption[];
  tags: TagOption[];
  authors: AuthorOption[];
  media: CoverMediaOption[];
  mediaError: boolean;
  initialValues: {
    title: string;
    slug: string;
    excerpt: string;
    categoryId: string;
    language: PostLanguage;
    coverMediaId: string;
    coverAlt: string;
    tagIds: string[];
    credits: InitialCredit[];
    body: BodyDocument;
  };
};

function FieldError({ id, message }: { id: string; message?: string }) {
  if (!message) return null;

  return (
    <p id={id} className="text-sm text-destructive">
      {message}
    </p>
  );
}

export function PostForm({
  mode,
  postId,
  revision,
  categories,
  tags,
  authors,
  media,
  mediaError,
  initialValues,
}: PostFormProps) {
  const t = useTranslations("adminPosts");
  const [credits, setCredits] = useState<InitialCredit[]>(
    initialValues.credits,
  );
  const [selectedTags, setSelectedTags] = useState<string[]>(
    initialValues.tagIds,
  );
  const [categoryId, setCategoryId] = useState(initialValues.categoryId);
  const [language, setLanguage] = useState<PostLanguage>(initialValues.language);
  const [coverMediaId, setCoverMediaId] = useState(initialValues.coverMediaId);
  const [coverAlt, setCoverAlt] = useState(initialValues.coverAlt);
  const [authorToAdd, setAuthorToAdd] = useState("");
  // The revision the unsaved edits were made against. A successful save
  // re-renders this form with a newer revision, which clears the warning
  // without remounting; a rejected save keeps it.
  const [editedRevision, setEditedRevision] = useState<number | null>(null);
  const dirty = editedRevision !== null && editedRevision === (revision ?? 0);
  useUnsavedChangesWarning(dirty);

  function markDirty() {
    setEditedRevision(revision ?? 0);
  }
  const [state, formAction, pending] = useActionState(
    mode === "create" ? createDraftPostAction : updatePostMetadataAction,
    initialState,
  );

  // After a rejected save, the submitted text becomes the default value so the
  // automatic form reset keeps what the user typed.
  const values = state.values ?? initialValues;
  const usedAuthorIds = new Set(credits.map((credit) => credit.authorId));
  const availableAuthors = authors.filter(
    (author) => !usedAuthorIds.has(author.id),
  );
  const reloadHref =
    mode === "edit" && postId ? `/admin/posts/${postId}` : "/admin/posts";

  function addCredit() {
    markDirty();
    const author = authors.find((option) => option.id === authorToAdd);
    if (!author || usedAuthorIds.has(author.id)) return;

    setCredits((current) => [
      ...current,
      { authorId: author.id, authorName: author.name },
    ]);
    setAuthorToAdd("");
  }

  function moveCredit(index: number, direction: -1 | 1) {
    markDirty();
    setCredits((current) => {
      const target = index + direction;
      if (target < 0 || target >= current.length) return current;

      const next = [...current];
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  }

  function removeCredit(index: number) {
    markDirty();
    setCredits((current) => current.filter((_, itemIndex) => itemIndex !== index));
  }

  function toggleTag(tagId: string, checked: boolean) {
    markDirty();
    setSelectedTags((current) =>
      checked
        ? [...current.filter((value) => value !== tagId), tagId]
        : current.filter((value) => value !== tagId),
    );
  }

  return (
    // Text fields and selects bubble their change events to the form.
    <form
      action={formAction}
      onChange={markDirty}
      // Close to the public article column (max-w-3xl), so lines wrap in the
      // editor roughly as they will on the published page.
      className="max-w-3xl space-y-8"
    >
      {mode === "edit" && postId ? (
        <>
          <input type="hidden" name="postId" value={postId} />
          <input type="hidden" name="revision" value={revision ?? ""} />
        </>
      ) : null}

      {state.status === "conflict" && state.message ? (
        <div
          role="alert"
          className="space-y-3 rounded-lg border border-amber-600/40 bg-amber-600/10 px-3 py-3 text-sm text-amber-900 dark:text-amber-200"
        >
          <p className="flex items-start gap-2">
            <CircleAlert
              aria-hidden="true"
              className="mt-0.5 size-4 shrink-0"
            />
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
        <Label htmlFor="post-language">{t("form.language")}</Label>
        <PostLanguagePicker
          id="post-language"
          name="language"
          value={language}
          onChange={(next) => {
            // The picker submits through a hidden input, which fires no
            // change event on the form.
            if (next !== language) markDirty();
            setLanguage(next);
          }}
          invalid={Boolean(state.fieldErrors.language)}
          describedBy="post-language-help post-language-error"
        />
        <p id="post-language-help" className="text-sm text-muted-foreground">
          {t("form.languageHelp")}
        </p>
        <FieldError id="post-language-error" message={state.fieldErrors.language} />
      </div>

      <div className="space-y-2">
        <Label htmlFor="post-title">{t("form.title")}</Label>
        <Input
          id="post-title"
          name="title"
          type="text"
          required
          maxLength={200}
          lang={language}
          defaultValue={values.title}
          aria-invalid={state.fieldErrors.title ? true : undefined}
          aria-describedby={
            state.fieldErrors.title ? "post-title-error" : undefined
          }
        />
        <FieldError id="post-title-error" message={state.fieldErrors.title} />
      </div>

      <div className="space-y-2">
        <Label htmlFor="post-slug">{t("form.slug")}</Label>
        <Input
          id="post-slug"
          name="slug"
          type="text"
          maxLength={200}
          defaultValue={values.slug}
          spellCheck={false}
          aria-invalid={state.fieldErrors.slug ? true : undefined}
          aria-describedby="post-slug-help post-slug-error"
        />
        <p id="post-slug-help" className="text-sm text-muted-foreground">
          {t("form.slugHelp")}
        </p>
        <FieldError id="post-slug-error" message={state.fieldErrors.slug} />
      </div>

      <div className="space-y-2">
        <Label htmlFor="post-excerpt">{t("form.excerpt")}</Label>
        <Textarea
          id="post-excerpt"
          name="excerpt"
          rows={4}
          maxLength={500}
          lang={language}
          defaultValue={values.excerpt}
          aria-invalid={state.fieldErrors.excerpt ? true : undefined}
          aria-describedby={
            state.fieldErrors.excerpt ? "post-excerpt-error" : undefined
          }
        />
        <p className="text-sm text-muted-foreground">{t("form.excerptHelp")}</p>
        <FieldError id="post-excerpt-error" message={state.fieldErrors.excerpt} />
      </div>

      <PostCoverField
        media={media}
        mediaError={mediaError}
        coverMediaId={coverMediaId}
        coverAlt={coverAlt}
        lang={language}
        mediaIdError={state.fieldErrors.coverMediaId}
        altError={state.fieldErrors.coverAlt}
        onCoverChange={(mediaId) => {
          // Choosing or removing a cover uses buttons, which fire no change
          // event on the form.
          markDirty();
          setCoverMediaId(mediaId);
        }}
        onAltChange={setCoverAlt}
      />

      <div className="space-y-2">
        <p id="post-body-label" className="text-sm font-medium">
          {t("form.body")}
        </p>
        <PostBodyEditor
          id="post-body"
          labelId="post-body-label"
          initialContent={initialValues.body}
          invalid={Boolean(state.fieldErrors.body)}
          describedBy="post-body-help post-body-error"
          lang={language}
          onChange={markDirty}
        />
        <p id="post-body-help" className="text-sm text-muted-foreground">
          {t("form.bodyHelp")}
        </p>
        <FieldError id="post-body-error" message={state.fieldErrors.body} />
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="post-category">{t("form.category")}</Label>
          <NativeSelect
            className="w-full"
            id="post-category"
            name="categoryId"
            value={categoryId}
            onChange={(event) => setCategoryId(event.target.value)}
            aria-invalid={state.fieldErrors.categoryId ? true : undefined}
            aria-describedby={
              state.fieldErrors.categoryId ? "post-category-error" : undefined
            }
          >
            <NativeSelectOption value="">{t("form.noCategory")}</NativeSelectOption>
            {categories.map((category) => (
              <NativeSelectOption key={category.id} value={category.id}>
                {"— ".repeat(category.depth)}
                {category.name}
              </NativeSelectOption>
            ))}
          </NativeSelect>
          <p className="text-sm text-muted-foreground">
            {t("form.categoryHelp")}
          </p>
          <FieldError
            id="post-category-error"
            message={state.fieldErrors.categoryId}
          />
        </div>

        <div className="space-y-3">
          <p className="text-sm font-medium">{t("form.tags")}</p>
          {tags.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              {t("form.noTags")}
            </p>
          ) : (
            <div className="space-y-2">
              {tags.map((tag) => {
                const checked = selectedTags.includes(tag.id);

                return (
                  <div key={tag.id} className="flex items-center gap-2">
                    <Checkbox
                      id={`post-tag-${tag.id}`}
                      checked={checked}
                      onCheckedChange={(value) =>
                        toggleTag(tag.id, value === true)
                      }
                    />
                    <Label htmlFor={`post-tag-${tag.id}`}>{tag.name}</Label>
                    {checked ? (
                      <input type="hidden" name="tagId" value={tag.id} />
                    ) : null}
                  </div>
                );
              })}
            </div>
          )}
          <FieldError id="post-tags-error" message={state.fieldErrors.tagIds} />
        </div>
      </div>

      <div className="space-y-3">
        <div>
          <p className="text-sm font-medium">{t("form.authors")}</p>
          <p className="text-sm text-muted-foreground">
            {t("form.authorsHelp")}
          </p>
        </div>

        {credits.length === 0 ? (
          <p className="rounded-lg border border-dashed px-3 py-3 text-sm text-muted-foreground">
            {t("form.noCredits")}
          </p>
        ) : (
          <ol className="space-y-2">
            {credits.map((credit, index) => (
              <li
                key={credit.authorId}
                className="flex flex-wrap items-center gap-2 rounded-lg border px-3 py-2"
              >
                <span className="min-w-6 text-sm text-muted-foreground">
                  {index + 1}.
                </span>
                <span className="min-w-0 flex-1 truncate text-sm font-medium">
                  {credit.authorName}
                </span>
                <input
                  type="hidden"
                  name="creditAuthorId"
                  value={credit.authorId}
                />
                <input
                  type="hidden"
                  name="creditSortOrder"
                  value={index}
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  onClick={() => moveCredit(index, -1)}
                  disabled={index === 0}
                  aria-label={t("form.moveUp", { name: credit.authorName })}
                >
                  <ArrowUp aria-hidden="true" />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  onClick={() => moveCredit(index, 1)}
                  disabled={index === credits.length - 1}
                  aria-label={t("form.moveDown", { name: credit.authorName })}
                >
                  <ArrowDown aria-hidden="true" />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  onClick={() => removeCredit(index)}
                  aria-label={t("form.removeCredit", { name: credit.authorName })}
                >
                  <Trash2 aria-hidden="true" />
                </Button>
              </li>
            ))}
          </ol>
        )}

        {authors.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            {t("form.noAuthorProfiles")}
          </p>
        ) : availableAuthors.length > 0 ? (
          <div className="flex flex-wrap items-end gap-2">
            <div className="min-w-56 flex-1 space-y-2">
              <Label htmlFor="post-author-to-add">{t("form.addAuthor")}</Label>
              <NativeSelect
                className="w-full"
                id="post-author-to-add"
                value={authorToAdd}
                onChange={(event) => setAuthorToAdd(event.target.value)}
              >
                <NativeSelectOption value="">{t("form.chooseAuthor")}</NativeSelectOption>
                {availableAuthors.map((author) => (
                  <NativeSelectOption key={author.id} value={author.id}>
                    {author.name}
                  </NativeSelectOption>
                ))}
              </NativeSelect>
            </div>
            <Button
              type="button"
              variant="outline"
              onClick={addCredit}
              disabled={!authorToAdd}
            >
              <Plus aria-hidden="true" />
              {t("form.add")}
            </Button>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            {t("form.allAuthorsAdded")}
          </p>
        )}

        <FieldError id="post-credits-error" message={state.fieldErrors.credits} />
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" disabled={pending}>
          {pending
            ? t("form.saving")
            : mode === "create"
              ? t("form.create")
              : t("form.save")}
        </Button>
        <Button asChild variant="ghost">
          <Link href="/admin/posts">{t("shared.cancel")}</Link>
        </Button>
      </div>
    </form>
  );
}
