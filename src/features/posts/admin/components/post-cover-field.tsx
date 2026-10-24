"use client";

import { useId, useRef, useState, useTransition } from "react";
import Image from "next/image";
import { Check, ImagePlus, Images, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { uploadMediaAction } from "@/features/media/actions";
import { mediaPublicUrl } from "@/features/media/url";
import { allowedMediaTypes, maxMediaBytes } from "@/features/media/validation";
import type { CoverMediaOption } from "@/features/posts/admin/types";
import { maxCoverAltLength } from "@/features/posts/admin/validation";
import { cn } from "@/lib/utils";

type PostCoverFieldProps = {
  media: CoverMediaOption[];
  mediaError: boolean;
  coverMediaId: string;
  coverAlt: string;
  lang: string;
  mediaIdError?: string;
  altError?: string;
  onCoverChange: (mediaId: string) => void;
  onAltChange: (alt: string) => void;
};

// Cover image for the post header, listing cards, and social previews. The
// reference and its alt text are stored on the post, outside the editor
// document. Choosing from the library or uploading reuses the Phase 6 media
// path; the form submits only the media id and the alt text.
export function PostCoverField({
  media,
  mediaError,
  coverMediaId,
  coverAlt,
  lang,
  mediaIdError,
  altError,
  onCoverChange,
  onAltChange,
}: PostCoverFieldProps) {
  const t = useTranslations("adminEditor");
  const id = useId();
  const fileRef = useRef<HTMLInputElement>(null);
  const [library, setLibrary] = useState(media);
  const [panel, setPanel] = useState<"closed" | "library" | "upload">("closed");
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const previewSrc = coverMediaId ? mediaPublicUrl(coverMediaId) : null;

  function choose(mediaId: string) {
    onCoverChange(mediaId);
    setPanel("closed");
  }

  function remove() {
    onCoverChange("");
    onAltChange("");
  }

  function upload() {
    setUploadError(null);
    const file = fileRef.current?.files?.[0];

    if (!file) {
      setUploadError(t("upload.fileRequired"));
      return;
    }

    // The server repeats this check. Catching it here avoids sending a body
    // that exceeds the Server Action limit, which would fail without a message.
    if (file.size > maxMediaBytes) {
      setUploadError(t("upload.fileTooLarge"));
      return;
    }

    const formData = new FormData();
    formData.set("file", file);

    startTransition(async () => {
      let result: Awaited<ReturnType<typeof uploadMediaAction>>;

      try {
        result = await uploadMediaAction(formData);
      } catch {
        setUploadError(t("upload.failed"));
        return;
      }

      if (!result.ok) {
        setUploadError(result.error);
        return;
      }

      const uploaded = result.media;
      setLibrary((current) => [uploaded, ...current]);
      choose(uploaded.id);
    });
  }

  const altId = `${id}-alt`;

  return (
    <div className="space-y-3">
      <div>
        <p id={`${id}-label`} className="text-sm font-medium">
          {t("cover.label")}
        </p>
        <p className="text-sm text-muted-foreground">
          {t("cover.help")}
        </p>
      </div>

      {coverMediaId ? (
        <div className="space-y-3 rounded-lg border p-3">
          <div className="relative aspect-video overflow-hidden rounded-md bg-muted">
            {previewSrc ? (
              <Image
                src={previewSrc}
                alt=""
                fill
                sizes="(min-width: 768px) 48rem, 100vw"
                className="object-cover"
              />
            ) : null}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor={altId}>{t("cover.alt")}</Label>
            <Input
              id={altId}
              name="coverAlt"
              type="text"
              value={coverAlt}
              lang={lang}
              maxLength={maxCoverAltLength}
              onChange={(event) => onAltChange(event.target.value)}
              placeholder={t("upload.altPlaceholder")}
              aria-invalid={altError ? true : undefined}
              aria-describedby={`${altId}-help${altError ? ` ${altId}-error` : ""}`}
            />
            <p id={`${altId}-help`} className="text-sm text-muted-foreground">
              {t("cover.altHelp")}
            </p>
            {altError ? (
              <p id={`${altId}-error`} className="text-sm text-destructive">
                {altError}
              </p>
            ) : null}
          </div>
        </div>
      ) : null}

      <input type="hidden" name="coverMediaId" value={coverMediaId} />

      {mediaIdError ? (
        <p className="text-sm text-destructive">{mediaIdError}</p>
      ) : null}

      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          aria-expanded={panel === "library"}
          onClick={() => setPanel(panel === "library" ? "closed" : "library")}
        >
          <Images aria-hidden="true" />
          {t("cover.chooseFromLibrary")}
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          aria-expanded={panel === "upload"}
          onClick={() => setPanel(panel === "upload" ? "closed" : "upload")}
        >
          <ImagePlus aria-hidden="true" />
          {t("cover.uploadNew")}
        </Button>
        {coverMediaId ? (
          <Button type="button" variant="ghost" size="sm" onClick={remove}>
            <Trash2 aria-hidden="true" />
            {t("cover.remove")}
          </Button>
        ) : null}
      </div>

      {panel === "library" ? (
        <div className="rounded-lg border p-3">
          {mediaError ? (
            <p role="alert" className="text-sm text-destructive">
              {t("cover.libraryError")}
            </p>
          ) : library.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              {t("cover.libraryEmpty")}
            </p>
          ) : (
            <ul
              aria-labelledby={`${id}-label`}
              className="grid max-h-80 grid-cols-2 gap-2 overflow-y-auto sm:grid-cols-3"
            >
              {library.map((item, index) => {
                const src = mediaPublicUrl(item.id);
                const selected = item.id === coverMediaId;
                // Dimensions are pixel counts, shown without digit grouping.
                const labelValues = {
                  position: index + 1,
                  width: String(item.width),
                  height: String(item.height),
                };

                return (
                  <li key={item.id}>
                    <button
                      type="button"
                      onClick={() => choose(item.id)}
                      aria-pressed={selected}
                      aria-label={
                        selected
                          ? t("cover.libraryItemSelected", labelValues)
                          : t("cover.libraryItem", labelValues)
                      }
                      className={cn(
                        "relative block aspect-video w-full overflow-hidden rounded-md border bg-muted outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
                        selected && "ring-2 ring-primary",
                      )}
                    >
                      {src ? (
                        <Image
                          src={src}
                          alt=""
                          fill
                          sizes="12rem"
                          className="object-cover"
                        />
                      ) : null}
                      {selected ? (
                        <span className="absolute top-1 right-1 rounded-full bg-primary p-1 text-primary-foreground">
                          <Check aria-hidden="true" className="size-3" />
                        </span>
                      ) : null}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      ) : null}

      {panel === "upload" ? (
        <div className="space-y-3 rounded-lg border p-3">
          <div className="space-y-1.5">
            <Label htmlFor={`${id}-file`}>{t("upload.file")}</Label>
            <Input
              ref={fileRef}
              id={`${id}-file`}
              type="file"
              accept={allowedMediaTypes.join(",")}
              disabled={pending}
              aria-describedby={`${id}-file-help`}
            />
            <p id={`${id}-file-help`} className="text-xs text-muted-foreground">
              {t("upload.fileHelp")}
            </p>
          </div>
          {uploadError ? (
            <p role="alert" className="text-sm text-destructive">
              {uploadError}
            </p>
          ) : null}
          <Button type="button" size="sm" onClick={upload} disabled={pending}>
            {pending ? t("upload.uploading") : t("cover.uploadAndSet")}
          </Button>
        </div>
      ) : null}
    </div>
  );
}
