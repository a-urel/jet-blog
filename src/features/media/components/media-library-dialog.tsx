"use client";

import { useId, useMemo, useRef, useState, type RefObject } from "react";
import Image from "next/image";
import { Check, ImagePlus } from "lucide-react";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { mediaPublicUrl } from "@/features/media/url";
import { cn } from "@/lib/utils";

export type MediaLibraryItem = Readonly<{ id: string; width: number; height: number }>;

export type MediaPreviewSurface = "light" | "dark";

export type MediaLibrarySort = "newest" | "largest";

export type MediaLibraryEntry = Readonly<{
  item: MediaLibraryItem;
  // 1-based position in the library's own (newest first) order.
  position: number;
  problem: string | null;
}>;

// Annotates each image with why it cannot be used here (or null) and orders
// the list. "newest" keeps the given order; "largest" sorts by pixel area,
// keeping the given order between equal areas.
export function arrangeLibraryItems(
  items: readonly MediaLibraryItem[],
  sort: MediaLibrarySort,
  validate?: (size: MediaLibraryItem) => string | null,
): MediaLibraryEntry[] {
  const entries = items.map((item, index) => ({
    item,
    position: index + 1,
    problem: validate?.(item) ?? null,
  }));
  if (sort === "largest") {
    entries.sort((a, b) => b.item.width * b.item.height - a.item.width * a.item.height);
  }
  return entries;
}

type MediaLibraryDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  // The field the image is for, shown in the title.
  fieldLabel: string;
  // What the field needs (size rules, where it is shown).
  description?: string;
  // Newest first, as listMedia() returns them.
  items: readonly MediaLibraryItem[];
  error: boolean;
  selectedId: string;
  onSelect: (mediaId: string) => void;
  // Returns why an image cannot be used here, or null. Unsuitable images stay
  // visible, dimmed, with the reason, instead of disappearing from the list.
  validate?: (size: MediaLibraryItem) => string | null;
  // Initial preview background, e.g. dark for a logo meant for dark pages.
  defaultSurface?: MediaPreviewSurface;
  // Offered in the empty state; the caller opens its upload panel.
  onUploadRequest?: () => void;
  // The button that opened the dialog. The dialog is controlled (no
  // DialogTrigger), so focus is returned to it explicitly on close.
  returnFocusRef?: RefObject<HTMLElement | null>;
};

// Shared media library picker for the site settings images and the post
// cover. Previews keep the whole image (object-contain) on a chosen light or
// dark surface, so transparent logos and portrait photos are judged as they
// are. The fixed neutral surfaces are intentional: they show the image on a
// light or dark page independent of the admin's own system theme.
export function MediaLibraryDialog({
  open,
  onOpenChange,
  fieldLabel,
  description,
  items,
  error,
  selectedId,
  onSelect,
  validate,
  defaultSurface = "light",
  onUploadRequest,
  returnFocusRef,
}: MediaLibraryDialogProps) {
  const t = useTranslations("adminMedia.library");
  const id = useId();
  const [surface, setSurface] = useState<MediaPreviewSurface>(defaultSurface);
  const [sort, setSort] = useState<MediaLibrarySort>("newest");
  const listRef = useRef<HTMLUListElement>(null);

  const entries = useMemo(
    () => arrangeLibraryItems(items, sort, validate),
    [items, sort, validate],
  );

  const suitableCount = entries.filter((entry) => !entry.problem).length;
  // When every unsuitable image fails for the same reason (the usual case:
  // one size rule per field), state it once above the grid instead of
  // repeating it under each tile.
  const problems = new Set(entries.flatMap((entry) => (entry.problem ? [entry.problem] : [])));
  const sharedProblem = problems.size === 1 ? [...problems][0] : null;
  const sharedProblemId = `${id}-shared-reason`;

  function choose(mediaId: string, problem: string | null) {
    if (problem) return;
    onSelect(mediaId);
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="flex max-h-[min(90dvh,48rem)] flex-col gap-0 p-0 sm:max-w-3xl"
        // Start on the selected image, else the first usable one, so the
        // keyboard lands in the grid rather than on the toolbar.
        onOpenAutoFocus={(event) => {
          const list = listRef.current;
          const target =
            list?.querySelector<HTMLElement>('button[aria-pressed="true"]') ??
            list?.querySelector<HTMLElement>("button:not([aria-disabled])");
          if (target) {
            event.preventDefault();
            target.focus();
          }
        }}
        onCloseAutoFocus={(event) => {
          const target = returnFocusRef?.current;
          if (target?.isConnected) {
            event.preventDefault();
            target.focus();
          }
        }}
      >
        <DialogHeader className="border-b p-4 pr-12">
          <DialogTitle>{t("title", { field: fieldLabel })}</DialogTitle>
          {description ? <DialogDescription>{description}</DialogDescription> : null}
        </DialogHeader>

        {error ? (
          <p role="alert" className="p-4 text-sm text-destructive">
            {t("error")}
          </p>
        ) : items.length === 0 ? (
          <div className="flex flex-col items-center gap-3 px-4 py-12 text-center">
            <p className="text-sm text-muted-foreground">{t("empty")}</p>
            {onUploadRequest ? (
              <Button
                type="button"
                size="sm"
                onClick={() => {
                  onOpenChange(false);
                  onUploadRequest();
                }}
              >
                <ImagePlus aria-hidden="true" />
                {t("emptyAction")}
              </Button>
            ) : null}
          </div>
        ) : (
          <>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b px-4 py-3">
              <div className="space-y-0.5 text-sm">
                <p className="text-muted-foreground" aria-live="polite">
                  {validate
                    ? t("countSuitable", { count: entries.length, suitable: suitableCount })
                    : t("count", { count: entries.length })}
                </p>
                {sharedProblem ? (
                  <p id={sharedProblemId} className="text-xs text-muted-foreground">
                    {t("unsuitableNote", { reason: sharedProblem })}
                  </p>
                ) : null}
              </div>
              <div className="ml-auto flex flex-wrap items-center gap-3">
                <div role="group" aria-label={t("surface")} className="flex rounded-lg border p-0.5">
                  {(["light", "dark"] as const).map((value) => (
                    <Button
                      key={value}
                      type="button"
                      size="xs"
                      variant={surface === value ? "secondary" : "ghost"}
                      aria-pressed={surface === value}
                      onClick={() => setSurface(value)}
                    >
                      {value === "light" ? t("surfaceLight") : t("surfaceDark")}
                    </Button>
                  ))}
                </div>
                <label className="sr-only" htmlFor={`${id}-sort`}>
                  {t("sort")}
                </label>
                <NativeSelect
                  id={`${id}-sort`}
                  size="sm"
                  value={sort}
                  onChange={(event) => setSort(event.target.value as MediaLibrarySort)}
                >
                  <NativeSelectOption value="newest">{t("sortNewest")}</NativeSelectOption>
                  <NativeSelectOption value="largest">{t("sortLargest")}</NativeSelectOption>
                </NativeSelect>
              </div>
            </div>

            <ul
              ref={listRef}
              aria-label={t("listLabel", { field: fieldLabel })}
              className="grid min-h-0 grid-cols-2 gap-3 overflow-y-auto p-4 sm:grid-cols-3 md:grid-cols-4"
            >
              {entries.map(({ item, position, problem }) => {
                const selected = item.id === selectedId;
                const src = mediaPublicUrl(item.id);
                // Pixel counts are shown without digit grouping.
                const values = {
                  position,
                  width: String(item.width),
                  height: String(item.height),
                };
                const reasonId = `${id}-reason-${item.id}`;
                const label = selected
                  ? t("itemSelected", values)
                  : problem
                    ? t("itemUnsuitable", values)
                    : t("item", values);

                return (
                  <li key={item.id}>
                    <button
                      type="button"
                      onClick={() => choose(item.id, problem)}
                      aria-pressed={selected}
                      aria-disabled={problem ? true : undefined}
                      aria-label={label}
                      aria-describedby={
                        problem ? (sharedProblem ? sharedProblemId : reasonId) : undefined
                      }
                      className={cn(
                        "group block w-full rounded-lg text-left outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
                        problem ? "cursor-not-allowed" : "cursor-pointer",
                      )}
                    >
                      <span
                        className={cn(
                          "relative block aspect-[4/3] overflow-hidden rounded-lg border",
                          surface === "dark" ? "border-neutral-700 bg-neutral-900" : "bg-neutral-50",
                          selected && "ring-2 ring-primary ring-offset-2 ring-offset-popover",
                          !problem && !selected && "group-hover:border-foreground/40",
                        )}
                      >
                        {src ? (
                          <Image
                            src={src}
                            alt=""
                            fill
                            sizes="(min-width: 768px) 11rem, (min-width: 640px) 14rem, 45vw"
                            className={cn("object-contain p-2", problem && "opacity-35 grayscale")}
                          />
                        ) : null}
                        {selected ? (
                          <span className="absolute top-1.5 right-1.5 rounded-full bg-primary p-1 text-primary-foreground">
                            <Check aria-hidden="true" className="size-3" />
                          </span>
                        ) : null}
                      </span>
                      <span className="mt-1.5 block text-xs tabular-nums text-muted-foreground">
                        {t("dimensions", { width: values.width, height: values.height })}
                      </span>
                      {problem ? (
                        <span
                          id={sharedProblem ? undefined : reasonId}
                          className="mt-0.5 block text-xs text-muted-foreground"
                        >
                          {sharedProblem ? t("unsuitable") : problem}
                        </span>
                      ) : null}
                    </button>
                  </li>
                );
              })}
            </ul>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
