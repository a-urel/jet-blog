"use client";

import { useId, useRef, useState, useTransition } from "react";
import type { Editor } from "@tiptap/react";
import { Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { uploadMediaAction } from "@/features/media/actions";
import { allowedMediaTypes, maxMediaBytes } from "@/features/media/validation";
import {
  maxImageAltLength,
  maxImageCaptionLength,
  type ImageAttrs,
} from "@/features/posts/content/schema";

type PostImagePanelProps = {
  editor: Editor;
  // Attributes of the selected image when editing; null when inserting.
  selected: ImageAttrs | null;
  onClose: () => void;
};

// Inserts an uploaded image or edits the alt text and caption of the selected
// one. Alt text belongs to this occurrence, so the same media can carry a
// different description in another post.
export function PostImagePanel({ editor, selected, onClose }: PostImagePanelProps) {
  const id = useId();
  const fileRef = useRef<HTMLInputElement>(null);
  const [alt, setAlt] = useState(selected?.alt ?? "");
  const [caption, setCaption] = useState(selected?.caption ?? "");
  const [decorative, setDecorative] = useState(selected?.decorative === true);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function close() {
    onClose();
    editor.commands.focus();
  }

  function occurrenceAttrs(): Pick<ImageAttrs, "alt" | "caption" | "decorative"> | null {
    const trimmedAlt = alt.trim();
    const trimmedCaption = caption.trim();

    if (!decorative && trimmedAlt.length === 0) {
      setError("Alternatif metin girin veya görseli dekoratif olarak işaretleyin.");
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

    const file = fileRef.current?.files?.[0];

    if (!file) {
      setError("Bir görsel dosyası seçin.");
      return;
    }

    // The server repeats this check. Catching it here avoids sending a body
    // that exceeds the Server Action limit, which would fail without a message.
    if (file.size > maxMediaBytes) {
      setError("Dosya en fazla 5 MB olabilir.");
      return;
    }

    const formData = new FormData();
    formData.set("file", file);

    startTransition(async () => {
      let result: Awaited<ReturnType<typeof uploadMediaAction>>;

      try {
        result = await uploadMediaAction(formData);
      } catch {
        setError("Yükleme tamamlanamadı. Bağlantınızı kontrol edip tekrar deneyin.");
        return;
      }


      if (!result.ok) {
        setError(result.error);
        return;
      }

      editor
        .chain()
        .focus()
        .insertContent({
          type: "image",
          attrs: {
            mediaId: result.media.id,
            width: result.media.width,
            height: result.media.height,
            alt: attrs.alt,
            caption: attrs.caption ?? null,
            decorative: attrs.decorative ?? null,
          },
        })
        .run();
      onClose();
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
      {selected ? null : (
        <div className="space-y-1.5">
          <Label htmlFor={`${id}-file`}>Görsel dosyası</Label>
          <Input
            ref={fileRef}
            id={`${id}-file`}
            type="file"
            accept={allowedMediaTypes.join(",")}
            autoFocus
            disabled={pending}
            aria-describedby={`${id}-file-help`}
          />
          <p id={`${id}-file-help`} className="text-xs text-muted-foreground">
            JPEG, PNG, WebP veya GIF; en fazla 5 MB. Yüklenen dosyalar herkese
            açık bir adresten sunulur.
          </p>
        </div>
      )}

      <div className="space-y-1.5">
        <Label htmlFor={`${id}-alt`}>Alternatif metin</Label>
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
          placeholder="Görselde ne görünüyor?"
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
          Dekoratif görsel (ekran okuyucular atlar)
        </Label>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor={`${id}-caption`}>Altyazı (isteğe bağlı)</Label>
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
          {selected ? "Uygula" : pending ? "Yükleniyor…" : "Yükle ve ekle"}
        </Button>
        {selected ? (
          <Button type="button" size="sm" variant="outline" onClick={remove}>
            <Trash2 aria-hidden="true" />
            Görseli kaldır
          </Button>
        ) : null}
        <Button type="button" size="sm" variant="ghost" onClick={close} disabled={pending}>
          Vazgeç
        </Button>
      </div>
    </div>
  );
}
