"use client";

import { useId, useRef, useState, useTransition } from "react";
import Image from "next/image";
import { ImagePlus, Images, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { uploadMediaAction } from "@/features/media/actions";
import {
  MediaLibraryDialog,
  type MediaLibraryItem,
} from "@/features/media/components/media-library-dialog";
import { mediaPublicUrl } from "@/features/media/url";
import { allowedMediaTypes, maxMediaBytes } from "@/features/media/validation";
import { cn } from "@/lib/utils";

export type BrandMediaOption = MediaLibraryItem;

type ImageSize = Readonly<{ width: number; height: number }>;

// Decodes the picked file in the browser to read its pixel size. Returns null
// when the browser cannot decode it; the server then decides on upload.
async function readImageSize(file: File): Promise<ImageSize | null> {
  if (typeof createImageBitmap !== "function") return null;
  try {
    const bitmap = await createImageBitmap(file);
    const size = { width: bitmap.width, height: bitmap.height };
    bitmap.close();
    return size;
  } catch {
    return null;
  }
}

type BrandMediaFieldProps = {
  name: string;
  label: string;
  hint: string;
  value: string;
  onChange: (mediaId: string) => void;
  library: BrandMediaOption[];
  libraryError: boolean;
  onUploaded: (media: BrandMediaOption) => void;
  error?: string;
  // Optional size rule (for example the square icon). Returns the message to
  // show, or null when the image is acceptable. Library images that fail it
  // are shown dimmed with the reason; it is also checked when a file is
  // picked and against the size the server measured after upload. The save
  // repeats the check on the server.
  validate?: (size: ImageSize) => string | null;
  // The surface the image is previewed on: a logo for dark backgrounds is
  // shown on a dark surface in both system themes.
  surface?: "page" | "dark";
};

// A site settings image (logo, icon, social image): pick one from the media
// library or upload a new one through the Phase 6 upload path (server-side
// signature validation, no SVG). The form submits only the media id.
export function BrandMediaField({
  name,
  label,
  hint,
  value,
  onChange,
  library,
  libraryError,
  onUploaded,
  error,
  validate,
  surface = "page",
}: BrandMediaFieldProps) {
  const t = useTranslations("adminSettings.media");
  const id = useId();
  const fileRef = useRef<HTMLInputElement>(null);
  const [panel, setPanel] = useState<"closed" | "upload">("closed");
  const [libraryOpen, setLibraryOpen] = useState(false);
  const libraryButtonRef = useRef<HTMLButtonElement>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const previewSrc = value ? mediaPublicUrl(value) : null;
  // Fixed dark surface: the preview shows how a dark-background logo looks,
  // independent of the admin's own system theme.
  const surfaceClass = surface === "dark" ? "bg-neutral-900" : "bg-muted";

  function choose(mediaId: string) {
    onChange(mediaId);
    setPanel("closed");
  }

  // Returns the message for a file that cannot be used here, or null.
  async function checkFile(file: File): Promise<string | null> {
    // The server repeats this check; catching it here avoids a body over the
    // Server Action limit, which would fail without a message.
    if (file.size > maxMediaBytes) return t("fileTooLarge");
    if (!validate) return null;
    const size = await readImageSize(file);
    return size ? validate(size) : null;
  }

  function fileChanged() {
    setUploadError(null);
    const file = fileRef.current?.files?.[0];
    if (!file) return;
    void checkFile(file).then((problem) => {
      // Ignore a result for a file that has since been replaced.
      if (fileRef.current?.files?.[0] === file) setUploadError(problem);
    });
  }

  function upload() {
    setUploadError(null);
    const file = fileRef.current?.files?.[0];

    if (!file) {
      setUploadError(t("fileRequired"));
      return;
    }

    startTransition(async () => {
      const problem = await checkFile(file);
      if (problem) {
        setUploadError(problem);
        return;
      }

      const formData = new FormData();
      formData.set("file", file);

      let result: Awaited<ReturnType<typeof uploadMediaAction>>;
      try {
        result = await uploadMediaAction(formData);
      } catch {
        setUploadError(t("failed"));
        return;
      }
      if (!result.ok) {
        setUploadError(result.error);
        return;
      }
      onUploaded(result.media);
      // The server measured the stored image; a file the browser could not
      // decode is checked here. It stays in the library but is not selected.
      const uploadedProblem = validate?.(result.media) ?? null;
      if (uploadedProblem) {
        setUploadError(uploadedProblem);
        return;
      }
      choose(result.media.id);
    });
  }

  const describedBy = [`${id}-hint`, error ? `${id}-error` : null].filter(Boolean).join(" ");

  return (
    <fieldset className="space-y-3" aria-describedby={describedBy}>
      <legend id={`${id}-label`} className="text-sm font-medium">
        {label}
      </legend>
      <p id={`${id}-hint`} className="text-xs text-muted-foreground">
        {hint}
      </p>

      <input type="hidden" name={name} value={value} />

      <div
        className={cn(
          "relative flex h-24 w-full max-w-xs items-center justify-center overflow-hidden rounded-md border",
          surfaceClass,
        )}
      >
        {previewSrc ? (
          <Image
            src={previewSrc}
            alt={t("preview")}
            fill
            sizes="20rem"
            className="object-contain p-2"
          />
        ) : (
          <span className={cn("text-sm", surface === "dark" ? "text-neutral-300" : "text-muted-foreground")}>
            {t("none")}
          </span>
        )}
      </div>

      {error ? (
        <p id={`${id}-error`} className="text-sm text-destructive">
          {error}
        </p>
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
          {t("choose")}
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          aria-expanded={panel === "upload"}
          onClick={() => setPanel(panel === "upload" ? "closed" : "upload")}
        >
          <ImagePlus aria-hidden="true" />
          {t("upload")}
        </Button>
        {value ? (
          <Button type="button" variant="ghost" size="sm" onClick={() => onChange("")}>
            <Trash2 aria-hidden="true" />
            {t("remove")}
          </Button>
        ) : null}
      </div>

      {panel === "upload" ? (
        <div className="space-y-3 rounded-lg border p-3">
          <div className="space-y-1.5">
            <Label htmlFor={`${id}-file`}>{t("file")}</Label>
            <Input
              ref={fileRef}
              id={`${id}-file`}
              type="file"
              accept={allowedMediaTypes.join(",")}
              disabled={pending}
              onChange={fileChanged}
              aria-invalid={uploadError ? true : undefined}
              aria-describedby={`${id}-file-help`}
            />
            <p id={`${id}-file-help`} className="text-xs text-muted-foreground">
              {t("fileHelp")}
            </p>
          </div>
          {uploadError ? (
            <p role="alert" className="text-sm text-destructive">
              {uploadError}
            </p>
          ) : null}
          <Button type="button" size="sm" onClick={upload} disabled={pending}>
            {pending ? t("uploading") : t("uploadAndSet")}
          </Button>
        </div>
      ) : null}
      <MediaLibraryDialog
        open={libraryOpen}
        onOpenChange={setLibraryOpen}
        fieldLabel={label}
        description={hint}
        items={library}
        error={libraryError}
        selectedId={value}
        onSelect={choose}
        validate={validate}
        defaultSurface={surface === "dark" ? "dark" : "light"}
        onUploadRequest={() => setPanel("upload")}
        returnFocusRef={libraryButtonRef}
      />
    </fieldset>
  );
}
