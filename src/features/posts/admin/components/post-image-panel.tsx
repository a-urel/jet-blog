"use client";

import { useId, useRef, useState, useTransition } from "react";
import Image from "next/image";
import type { Editor } from "@tiptap/react";
import { Images, Trash2, X } from "lucide-react";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { uploadMediaAction } from "@/features/media/actions";
import {
  MediaLibraryDialog,
  type MediaLibraryItem,
} from "@/features/media/components/media-library-dialog";
import { mediaPublicUrl } from "@/features/media/url";
import { allowedMediaTypes, maxMediaBytes } from "@/features/media/validation";
import { insertBlockNode } from "@/features/posts/content/insert-block";
import {
  maxImageAltLength,
  maxImageCaptionLength,
  type ImageAttrs,
} from "@/features/posts/content/schema";

// The shared media library, when the page loaded it.
export type EditorMediaLibrary = Readonly<{
  items: readonly MediaLibraryItem[];
  error: boolean;
  onUploaded: (media: MediaLibraryItem) => void;
}>;

type PostImagePanelProps = {
  editor: Editor;
  // Attributes of the selected image when editing; null when inserting.
  selected: ImageAttrs | null;
  onClose: () => void;
  library?: EditorMediaLibrary;
};

// Inserts an image, uploaded or chosen from the media library, or edits the
// alt text and caption of the selected one. Alt text belongs to this
// occurrence, so the same media can carry a different description in another
// post. A library image is inserted without uploading anything.
export function PostImagePanel({ editor, selected, onClose, library }: PostImagePanelProps) {
  const t = useTranslations("adminEditor");
  const tLibrary = useTranslations("adminMedia.library");
  const id = useId();
  const fileRef = useRef<HTMLInputElement>(null);
  const [alt, setAlt] = useState(selected?.alt ?? "");
  const [caption, setCaption] = useState(selected?.caption ?? "");
  const [decorative, setDecorative] = useState(selected?.decorative === true);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [libraryChoice, setLibraryChoice] = useState<MediaLibraryItem | null>(null);
  const [libraryOpen, setLibraryOpen] = useState(false);
  const libraryButtonRef = useRef<HTMLButtonElement>(null);
  const libraryChoiceSrc = libraryChoice ? mediaPublicUrl(libraryChoice.id) : null;

  function insertImage(
    media: MediaLibraryItem,
    attrs: Pick<ImageAttrs, "alt" | "caption" | "decorative">,
  ) {
    editor
      .chain()
      .focus()
      .command(({ tr, state }) => {
        insertBlockNode(
          tr,
          state.schema.nodes.image.create({
            mediaId: media.id,
            width: media.width,
            height: media.height,
            alt: attrs.alt,
            caption: attrs.caption ?? null,
            decorative: attrs.decorative ?? null,
          }),
        );
        return true;
      })
      .run();
    onClose();
  }

  function close() {
    onClose();
    editor.commands.focus();
  }

  function occurrenceAttrs(): Pick<ImageAttrs, "alt" | "caption" | "decorative"> | null {
    const trimmedAlt = alt.trim();
    const trimmedCaption = caption.trim();

    if (!decorative && trimmedAlt.length === 0) {
      setError(t("image.altRequired"));
      return null;
    }

    return {
      alt: decorative ? "" : trimmedAlt,
      caption: trimmedCaption.length > 0 ? trimmedCaption : undefined,
      decorative: decorative ? true : undefined,
    };
  }

  function apply() {
    setError(null);
    const attrs = occurrenceAttrs();
    if (!attrs) return;

    if (selected) {
      editor
        .chain()
        .focus()
        .updateAttributes("image", {
          alt: attrs.alt,
          caption: attrs.caption ?? null,
          decorative: attrs.decorative ?? null,
        })
        .run();
      onClose();
      return;
    }

    if (libraryChoice) {
      insertImage(libraryChoice, attrs);
      return;
    }

    const file = fileRef.current?.files?.[0];

    if (!file) {
      setError(t("upload.fileRequired"));
      return;
    }

    // The server repeats this check. Catching it here avoids sending a body
    // that exceeds the Server Action limit, which would fail without a message.
    if (file.size > maxMediaBytes) {
      setError(t("upload.fileTooLarge"));
      return;
    }

    const formData = new FormData();
    formData.set("file", file);

    startTransition(async () => {
      let result: Awaited<ReturnType<typeof uploadMediaAction>>;

      try {
        result = await uploadMediaAction(formData);
      } catch {
        setError(t("upload.failed"));
        return;
      }


      if (!result.ok) {
        setError(result.error);
        return;
      }

      library?.onUploaded(result.media);
      insertImage(result.media, attrs);
    });
  }

  function remove() {
    editor.chain().focus().deleteSelection().run();
    onClose();
  }

  const errorId = `${id}-error`;

  return (
    <div
      className="space-y-3 border-b px-3 py-3"
      onKeyDown={(event) => {
        // Keys from the library dialog bubble here through the React tree
        // (it renders in a portal); the dialog handles its own.
        if (!event.currentTarget.contains(event.target as Node)) return;
        // Enter must not submit the surrounding post form.
        if (event.key === "Enter" && event.target instanceof HTMLInputElement) {
          event.preventDefault();
          if (event.target.type !== "file") apply();
        }
        if (event.key === "Escape") {
          event.preventDefault();
          close();
        }
      }}
    >
      {selected ? null : libraryChoice ? (
        <div className="flex items-center gap-3 rounded-lg border p-2">
          <span className="relative block h-14 w-20 shrink-0 overflow-hidden rounded-md border bg-neutral-50">
            {libraryChoiceSrc ? (
              <Image
                src={libraryChoiceSrc}
                alt=""
                fill
                sizes="5rem"
                className="object-contain p-1"
              />
            ) : null}
          </span>
          <div className="min-w-0 flex-1 text-sm">
            <p className="truncate font-medium">
              {libraryChoice.originalName ?? t("image.libraryImage")}
            </p>
            <p className="text-xs tabular-nums text-muted-foreground">
              {tLibrary("dimensions", {
                width: String(libraryChoice.width),
                height: String(libraryChoice.height),
              })}
            </p>
          </div>
          <Button
            ref={libraryButtonRef}
            type="button"
            size="sm"
            variant="outline"
            aria-haspopup="dialog"
            onClick={() => setLibraryOpen(true)}
          >
            {t("image.changeLibraryChoice")}
          </Button>
          <Button
            type="button"
            size="icon-sm"
            variant="ghost"
            aria-label={t("image.clearLibraryChoice")}
            onClick={() => setLibraryChoice(null)}
          >
            <X aria-hidden="true" />
          </Button>
        </div>
      ) : (
        <div className="space-y-1.5">
          <Label htmlFor={`${id}-file`}>{t("upload.file")}</Label>
          <div className="flex flex-wrap items-center gap-2">
            <Input
              ref={fileRef}
              id={`${id}-file`}
              type="file"
              accept={allowedMediaTypes.join(",")}
              autoFocus
              disabled={pending}
              aria-describedby={`${id}-file-help`}
              className="min-w-0 flex-1"
            />
            {library ? (
              <Button
                ref={libraryButtonRef}
                type="button"
                size="sm"
                variant="outline"
                aria-haspopup="dialog"
                disabled={pending}
                onClick={() => setLibraryOpen(true)}
              >
                <Images aria-hidden="true" />
                {t("image.chooseFromLibrary")}
              </Button>
            ) : null}
          </div>
          <p id={`${id}-file-help`} className="text-xs text-muted-foreground">
            {t("upload.fileHelp")}
          </p>
        </div>
      )}

      <div className="space-y-1.5">
        <Label htmlFor={`${id}-alt`}>{t("image.alt")}</Label>
        <Input
          id={`${id}-alt`}
          type="text"
          value={decorative ? "" : alt}
          maxLength={maxImageAltLength}
          disabled={decorative || pending}
          autoFocus={Boolean(selected)}
          aria-invalid={error && !decorative && alt.trim() === "" ? true : undefined}
          aria-describedby={error ? errorId : undefined}
          onChange={(event) => setAlt(event.target.value)}
          placeholder={t("upload.altPlaceholder")}
        />
      </div>

      <div className="flex items-center gap-2">
        <Checkbox
          id={`${id}-decorative`}
          checked={decorative}
          disabled={pending}
          onCheckedChange={(checked) => setDecorative(checked === true)}
        />
        <Label htmlFor={`${id}-decorative`} className="font-normal">
          {t("image.decorative")}
        </Label>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor={`${id}-caption`}>{t("image.caption")}</Label>
        <Input
          id={`${id}-caption`}
          type="text"
          value={caption}
          maxLength={maxImageCaptionLength}
          disabled={pending}
          onChange={(event) => setCaption(event.target.value)}
        />
      </div>

      {error ? (
        <p id={errorId} role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}

      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" size="sm" onClick={apply} disabled={pending}>
          {selected
            ? t("image.apply")
            : pending
              ? t("upload.uploading")
              : libraryChoice
                ? t("image.insert")
                : t("image.uploadAndInsert")}
        </Button>
        {selected ? (
          <Button type="button" size="sm" variant="outline" onClick={remove}>
            <Trash2 aria-hidden="true" />
            {t("image.remove")}
          </Button>
        ) : null}
        <Button type="button" size="sm" variant="ghost" onClick={close} disabled={pending}>
          {t("cancel")}
        </Button>
      </div>

      {library ? (
        <MediaLibraryDialog
          open={libraryOpen}
          onOpenChange={setLibraryOpen}
          fieldLabel={t("image.libraryFieldLabel")}
          items={library.items}
          error={library.error}
          selectedId={libraryChoice?.id ?? ""}
          onSelect={(mediaId) => {
            const item = library.items.find((candidate) => candidate.id === mediaId);
            if (item) {
              setLibraryChoice(item);
              setError(null);
            }
          }}
          returnFocusRef={libraryButtonRef}
        />
      ) : null}
    </div>
  );
}
