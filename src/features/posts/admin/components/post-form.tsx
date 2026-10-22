"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
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
  createDraftPostAction,
  updatePostMetadataAction,
  type PostFormState,
} from "@/features/posts/admin/actions";
import type {
  AuthorOption,
  CategoryOption,
  TagOption,
} from "@/features/posts/admin/types";
import type { BodyDocument } from "@/features/posts/content/schema";
import { PostBodyEditor } from "./post-body-editor";

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
  initialValues: {
    title: string;
    slug: string;
    excerpt: string;
    categoryId: string;
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
  initialValues,
}: PostFormProps) {
  const [credits, setCredits] = useState<InitialCredit[]>(
    initialValues.credits,
  );
  const [selectedTags, setSelectedTags] = useState<string[]>(
    initialValues.tagIds,
  );
  const [authorToAdd, setAuthorToAdd] = useState("");
  const [state, formAction, pending] = useActionState(
    mode === "create" ? createDraftPostAction : updatePostMetadataAction,
    initialState,
  );

  const usedAuthorIds = new Set(credits.map((credit) => credit.authorId));
  const availableAuthors = authors.filter(
    (author) => !usedAuthorIds.has(author.id),
  );
  const reloadHref =
    mode === "edit" && postId ? `/admin/posts/${postId}` : "/admin/posts";

  function addCredit() {
    const author = authors.find((option) => option.id === authorToAdd);
    if (!author || usedAuthorIds.has(author.id)) return;

    setCredits((current) => [
      ...current,
      { authorId: author.id, authorName: author.name },
    ]);
    setAuthorToAdd("");
  }

  function moveCredit(index: number, direction: -1 | 1) {
    setCredits((current) => {
      const target = index + direction;
      if (target < 0 || target >= current.length) return current;

      const next = [...current];
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  }

  function removeCredit(index: number) {
    setCredits((current) => current.filter((_, itemIndex) => itemIndex !== index));
  }

  function toggleTag(tagId: string, checked: boolean) {
    setSelectedTags((current) =>
      checked
        ? [...current.filter((value) => value !== tagId), tagId]
        : current.filter((value) => value !== tagId),
    );
  }

  return (
    <form action={formAction} className="space-y-8">
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
              Güncel sürümü aç
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
        <Label htmlFor="post-title">Başlık</Label>
        <Input
          id="post-title"
          name="title"
          type="text"
          required
          maxLength={200}
          defaultValue={initialValues.title}
          aria-invalid={state.fieldErrors.title ? true : undefined}
          aria-describedby={
            state.fieldErrors.title ? "post-title-error" : undefined
          }
        />
        <FieldError id="post-title-error" message={state.fieldErrors.title} />
      </div>

      <div className="space-y-2">
        <Label htmlFor="post-slug">Slug</Label>
        <Input
          id="post-slug"
          name="slug"
          type="text"
          maxLength={200}
          defaultValue={initialValues.slug}
          spellCheck={false}
          aria-invalid={state.fieldErrors.slug ? true : undefined}
          aria-describedby="post-slug-help post-slug-error"
        />
        <p id="post-slug-help" className="text-sm text-muted-foreground">
          Boş bırakılırsa başlıktan üretilir. Küçük harf, rakam ve tek tire
          kullanın; URL&apos;de bu değer görünür.
        </p>
        <FieldError id="post-slug-error" message={state.fieldErrors.slug} />
      </div>

      <div className="space-y-2">
        <Label htmlFor="post-excerpt">Özet</Label>
        <Textarea
          id="post-excerpt"
          name="excerpt"
          rows={4}
          maxLength={500}
          defaultValue={initialValues.excerpt}
          aria-invalid={state.fieldErrors.excerpt ? true : undefined}
          aria-describedby={
            state.fieldErrors.excerpt ? "post-excerpt-error" : undefined
          }
        />
        <p className="text-sm text-muted-foreground">En fazla 500 karakter.</p>
        <FieldError id="post-excerpt-error" message={state.fieldErrors.excerpt} />
      </div>

      <div className="space-y-2">
        <p id="post-body-label" className="text-sm font-medium">
          Yazı gövdesi
        </p>
        <PostBodyEditor
          id="post-body"
          labelId="post-body-label"
          initialContent={initialValues.body}
          invalid={Boolean(state.fieldErrors.body)}
          describedBy="post-body-help post-body-error"
        />
        <p id="post-body-help" className="text-sm text-muted-foreground">
          Araç çubuğunda ok tuşlarıyla gezinebilirsiniz. Görsel ve video
          desteği sonraki artışlarda eklenecek.
        </p>
        <FieldError id="post-body-error" message={state.fieldErrors.body} />
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="post-category">Kategori</Label>
          <select
            id="post-category"
            name="categoryId"
            defaultValue={initialValues.categoryId}
            className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 dark:bg-input/30"
            aria-invalid={state.fieldErrors.categoryId ? true : undefined}
            aria-describedby={
              state.fieldErrors.categoryId ? "post-category-error" : undefined
            }
          >
            <option value="">Kategori seçilmedi</option>
            {categories.map((category) => (
              <option key={category.id} value={category.id}>
                {"— ".repeat(category.depth)}
                {category.name}
              </option>
            ))}
          </select>
          <p className="text-sm text-muted-foreground">
            Taslakta kategori zorunlu değil; yayın öncesi gerekir.
          </p>
          <FieldError
            id="post-category-error"
            message={state.fieldErrors.categoryId}
          />
        </div>

        <div className="space-y-3">
          <p className="text-sm font-medium">Etiketler</p>
          {tags.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Henüz etiket yok. Etiket yönetimi ayrı bir artışta ele alınacak.
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
          <p className="text-sm font-medium">Yazarlar</p>
          <p className="text-sm text-muted-foreground">
            Görünme sırasına göre ekleyin. Yazar kredisi düzenleme yetkisi
            vermez.
          </p>
        </div>

        {credits.length === 0 ? (
          <p className="rounded-lg border border-dashed px-3 py-3 text-sm text-muted-foreground">
            Henüz yazar eklenmedi.
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
                  aria-label={`${credit.authorName} yazarını yukarı taşı`}
                >
                  <ArrowUp aria-hidden="true" />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  onClick={() => moveCredit(index, 1)}
                  disabled={index === credits.length - 1}
                  aria-label={`${credit.authorName} yazarını aşağı taşı`}
                >
                  <ArrowDown aria-hidden="true" />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  onClick={() => removeCredit(index)}
                  aria-label={`${credit.authorName} yazarını kaldır`}
                >
                  <Trash2 aria-hidden="true" />
                </Button>
              </li>
            ))}
          </ol>
        )}

        {authors.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Yazar profili yok. Yazar yönetimi ayrı bir artışta ele alınacak.
          </p>
        ) : availableAuthors.length > 0 ? (
          <div className="flex flex-wrap items-end gap-2">
            <div className="min-w-56 flex-1 space-y-2">
              <Label htmlFor="post-author-to-add">Yazar ekle</Label>
              <select
                id="post-author-to-add"
                value={authorToAdd}
                onChange={(event) => setAuthorToAdd(event.target.value)}
                className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 dark:bg-input/30"
              >
                <option value="">Yazar seçin</option>
                {availableAuthors.map((author) => (
                  <option key={author.id} value={author.id}>
                    {author.name}
                  </option>
                ))}
              </select>
            </div>
            <Button
              type="button"
              variant="outline"
              onClick={addCredit}
              disabled={!authorToAdd}
            >
              <Plus aria-hidden="true" />
              Ekle
            </Button>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            Tüm yazarlar zaten eklendi.
          </p>
        )}

        <FieldError id="post-credits-error" message={state.fieldErrors.credits} />
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" disabled={pending}>
          {pending
            ? "Kaydediliyor…"
            : mode === "create"
              ? "Taslağı oluştur"
              : "Değişiklikleri kaydet"}
        </Button>
        <Button asChild variant="ghost">
          <Link href="/admin/posts">Vazgeç</Link>
        </Button>
      </div>
    </form>
  );
}
