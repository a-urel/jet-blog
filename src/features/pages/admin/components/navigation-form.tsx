"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { ArrowDown, ArrowUp, CircleAlert, FileText, Link2, RotateCcw, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { useUnsavedChangesWarning } from "@/features/posts/admin/components/use-unsaved-changes-warning";
import {
  maxNavigationItems,
  maxNavigationLabelLength,
  maxNavigationUrlLength,
  type NavigationLocation,
} from "../../navigation";
import { saveNavigationAction, type NavigationFormState } from "../actions";
import type { AdminNavigationItem } from "../data";

const initialState: NavigationFormState = { status: "idle", message: null, itemErrors: {} };

type Row = AdminNavigationItem & { key: number };

export type NavigationPageOption = { id: string; title: string; published: boolean };

// Editor for one menu. Rows are client state, submitted as JSON and saved as
// a whole (save_navigation) against the menu revision the page rendered.
export function NavigationForm({
  location,
  revision,
  items,
  pages,
}: {
  location: NavigationLocation;
  revision: number;
  items: AdminNavigationItem[];
  pages: NavigationPageOption[];
}) {
  const t = useTranslations("adminPages.navigation");
  const [state, formAction, pending] = useActionState(saveNavigationAction, initialState);
  const [rows, setRows] = useState<Row[]>(() => items.map((item, key) => ({ ...item, key })));
  const [nextKey, setNextKey] = useState(items.length);
  const [editedRevision, setEditedRevision] = useState<number | null>(null);
  useUnsavedChangesWarning(editedRevision === revision);

  const idPrefix = `nav-${location}`;

  function update(change: (current: Row[]) => Row[]) {
    setEditedRevision(revision);
    setRows(change);
  }

  function add(type: Row["type"]) {
    const key = nextKey;
    setNextKey(key + 1);
    update((current) => [
      ...current,
      type === "page"
        ? { key, type: "page", pageId: pages[0]?.id ?? "", label: "" }
        : { key, type: "url", url: "https://", label: "" },
    ]);
  }

  function move(index: number, direction: -1 | 1) {
    update((current) => {
      const target = index + direction;
      if (target < 0 || target >= current.length) return current;
      const next = [...current];
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  }

  function patch(index: number, values: Partial<Row>) {
    update((current) =>
      current.map((row, rowIndex) => (rowIndex === index ? ({ ...row, ...values } as Row) : row)),
    );
  }

  const payload = JSON.stringify(
    rows.map((row) =>
      row.type === "page"
        ? { type: "page", pageId: row.pageId, label: row.label }
        : { type: "url", url: row.url, label: row.label },
    ),
  );

  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="location" value={location} />
      <input type="hidden" name="revision" value={revision} />
      <input type="hidden" name="items" value={payload} />

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
            <Link href="/admin/navigation">
              <RotateCcw aria-hidden="true" />
              {t("reload")}
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

      {rows.length === 0 ? (
        <p className="rounded-lg border border-dashed px-3 py-3 text-sm text-muted-foreground">
          {t(`empty.${location}`)}
        </p>
      ) : (
        <ol className="space-y-3">
          {rows.map((row, index) => {
            const rowId = `${idPrefix}-${row.key}`;
            const error = state.itemErrors[index];

            return (
              <li key={row.key} className="space-y-3 rounded-lg border px-3 py-3">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="min-w-6 text-sm text-muted-foreground">{index + 1}.</span>
                  <span className="flex flex-1 items-center gap-1.5 text-sm font-medium">
                    {row.type === "page" ? (
                      <FileText aria-hidden="true" className="size-4" />
                    ) : (
                      <Link2 aria-hidden="true" className="size-4" />
                    )}
                    {t(row.type === "page" ? "pageItem" : "urlItem")}
                  </span>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    onClick={() => move(index, -1)}
                    disabled={index === 0}
                    aria-label={t("moveUp", { position: index + 1 })}
                  >
                    <ArrowUp aria-hidden="true" />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    onClick={() => move(index, 1)}
                    disabled={index === rows.length - 1}
                    aria-label={t("moveDown", { position: index + 1 })}
                  >
                    <ArrowDown aria-hidden="true" />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    onClick={() => update((current) => current.filter((_, i) => i !== index))}
                    aria-label={t("remove", { position: index + 1 })}
                  >
                    <Trash2 aria-hidden="true" />
                  </Button>
                </div>

                <div className="grid gap-3 md:grid-cols-2">
                  {row.type === "page" ? (
                    <div className="space-y-2">
                      <Label htmlFor={`${rowId}-page`}>{t("page")}</Label>
                      <NativeSelect
                        id={`${rowId}-page`}
                        className="w-full"
                        value={row.pageId}
                        onChange={(event) => patch(index, { pageId: event.target.value })}
                        aria-invalid={error ? true : undefined}
                        aria-describedby={error ? `${rowId}-error` : undefined}
                      >
                        <NativeSelectOption value="">{t("choosePage")}</NativeSelectOption>
                        {pages.map((page) => (
                          <NativeSelectOption key={page.id} value={page.id}>
                            {page.published ? page.title : t("draftPage", { title: page.title })}
                          </NativeSelectOption>
                        ))}
                      </NativeSelect>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      <Label htmlFor={`${rowId}-url`}>{t("url")}</Label>
                      <Input
                        id={`${rowId}-url`}
                        type="url"
                        inputMode="url"
                        spellCheck={false}
                        maxLength={maxNavigationUrlLength}
                        value={row.url}
                        onChange={(event) => patch(index, { url: event.target.value })}
                        aria-invalid={error ? true : undefined}
                        aria-describedby={error ? `${rowId}-error` : `${rowId}-url-help`}
                      />
                      <p id={`${rowId}-url-help`} className="text-xs text-muted-foreground">
                        {t("urlHelp")}
                      </p>
                    </div>
                  )}
                  <div className="space-y-2">
                    <Label htmlFor={`${rowId}-label`}>
                      {row.type === "page" ? t("labelOptional") : t("label")}
                    </Label>
                    <Input
                      id={`${rowId}-label`}
                      maxLength={maxNavigationLabelLength}
                      value={row.label}
                      onChange={(event) => patch(index, { label: event.target.value })}
                      aria-invalid={error ? true : undefined}
                      aria-describedby={error ? `${rowId}-error` : undefined}
                    />
                  </div>
                </div>

                {error ? (
                  <p id={`${rowId}-error`} className="text-sm text-destructive">
                    {error}
                  </p>
                ) : null}
              </li>
            );
          })}
        </ol>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          variant="outline"
          onClick={() => add("page")}
          disabled={pages.length === 0 || rows.length >= maxNavigationItems}
        >
          <FileText aria-hidden="true" />
          {t("addPage")}
        </Button>
        <Button
          type="button"
          variant="outline"
          onClick={() => add("url")}
          disabled={rows.length >= maxNavigationItems}
        >
          <Link2 aria-hidden="true" />
          {t("addUrl")}
        </Button>
        <Button type="submit" disabled={pending}>
          {pending ? t("saving") : t("save")}
        </Button>
      </div>
    </form>
  );
}
