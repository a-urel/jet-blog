"use client";

import { useId, useRef, useState, useTransition } from "react";
import Image from "next/image";
import { ImagePlus, Images, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { uploadMediaAction } from "@/features/media/actions";
import { MediaLibraryDialog } from "@/features/media/components/media-library-dialog";
import { mediaPublicUrl } from "@/features/media/url";
import { allowedMediaTypes, maxMediaBytes } from "@/features/media/validation";
import type { CoverMediaOption } from "@/features/posts/admin/types";
import { maxCoverAltLength } from "@/features/posts/admin/validation";

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
  const [panel, setPanel] = useState<"closed" | "upload">("closed");
  const [libraryOpen, setLibraryOpen] = useState(false);
  const libraryButtonRef = useRef<HTMLButtonElement>(null);
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
          ref={libraryButtonRef}
          aria-haspopup="dialog"
          onClick={() => {
            setPanel("closed");
            setLibraryOpen(true);
          }}
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

      <MediaLibraryDialog
        open={libraryOpen}
        onOpenChange={setLibraryOpen}
        fieldLabel={t("cover.label")}
        description={t("cover.help")}
        items={library}
        error={mediaError}
        selectedId={coverMediaId}
        onSelect={choose}
        onUploadRequest={() => setPanel("upload")}
        returnFocusRef={libraryButtonRef}
      />
    </div>
  );
}
