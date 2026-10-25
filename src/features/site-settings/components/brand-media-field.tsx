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
import { cn } from "@/lib/utils";

export type BrandMediaOption = Readonly<{ id: string; width: number; height: number }>;

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
  surface = "page",
}: BrandMediaFieldProps) {
  const t = useTranslations("adminSettings.media");
  const id = useId();
  const fileRef = useRef<HTMLInputElement>(null);
  const [panel, setPanel] = useState<"closed" | "library" | "upload">("closed");
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

  function upload() {
    setUploadError(null);
    const file = fileRef.current?.files?.[0];

    if (!file) {
      setUploadError(t("fileRequired"));
      return;
    }
    // The server repeats this check; catching it here avoids a body over the
    // Server Action limit, which would fail without a message.
    if (file.size > maxMediaBytes) {
      setUploadError(t("fileTooLarge"));
      return;
    }

    const formData = new FormData();
    formData.set("file", file);

    startTransition(async () => {
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
          aria-expanded={panel === "library"}
          onClick={() => setPanel(panel === "library" ? "closed" : "library")}
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

      {panel === "library" ? (
        <div className="rounded-lg border p-3">
          {libraryError ? (
            <p role="alert" className="text-sm text-destructive">
              {t("libraryError")}
            </p>
          ) : library.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("libraryEmpty")}</p>
          ) : (
            <ul
              aria-labelledby={`${id}-label`}
              className="grid max-h-72 grid-cols-3 gap-2 overflow-y-auto sm:grid-cols-4"
            >
              {library.map((item, index) => {
                const src = mediaPublicUrl(item.id);
                const selected = item.id === value;
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
                        selected ? t("libraryItemSelected", labelValues) : t("libraryItem", labelValues)
                      }
                      className={cn(
                        "relative block aspect-square w-full overflow-hidden rounded-md border outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
                        surfaceClass,
                        selected && "ring-2 ring-primary",
                      )}
                    >
                      {src ? (
                        <Image src={src} alt="" fill sizes="8rem" className="object-contain p-1" />
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
            <Label htmlFor={`${id}-file`}>{t("file")}</Label>
            <Input
              ref={fileRef}
              id={`${id}-file`}
              type="file"
              accept={allowedMediaTypes.join(",")}
              disabled={pending}
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
    </fieldset>
  );
}
