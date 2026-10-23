"use client";

import { useId, useState } from "react";
import type { Editor } from "@tiptap/react";
import { Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { insertBlockNode } from "@/features/posts/content/insert-block";
import {
  maxVideoTitleLength,
  type YouTubeAttrs,
} from "@/features/posts/content/schema";
import {
  parseYouTubeUrl,
  youtubeWatchUrl,
} from "@/features/posts/content/youtube";

type PostVideoPanelProps = {
  editor: Editor;
  // Attributes of the selected video when editing; null when inserting.
  selected: YouTubeAttrs | null;
  onClose: () => void;
};

// Inserts a YouTube video from a pasted URL or edits the selected one. Only
// the parsed video id, start offset, and title are kept; the URL itself is not
// stored.
export function PostVideoPanel({ editor, selected, onClose }: PostVideoPanelProps) {
  const id = useId();
  const [url, setUrl] = useState(
    selected ? youtubeWatchUrl(selected.videoId, selected.start) : "",
  );
  const [title, setTitle] = useState(selected?.title ?? "");
  const [error, setError] = useState<{ field: "url" | "title"; message: string } | null>(
    null,
  );

  function close() {
    onClose();
    editor.commands.focus();
  }

  function apply() {
    setError(null);
    const parsed = parseYouTubeUrl(url);

    if (!parsed) {
      setError({
        field: "url",
        message:
          "Yalnızca youtube.com/watch, youtu.be, youtube.com/shorts veya youtube.com/embed bağlantıları desteklenir.",
      });
      return;
    }

    const trimmedTitle = title.trim();

    if (trimmedTitle.length === 0) {
      setError({
        field: "title",
        message: "Ekran okuyucular için videoyu tanımlayan bir başlık girin.",
      });
      return;
    }

    const attrs = {
      videoId: parsed.videoId,
      title: trimmedTitle,
      start: parsed.start ?? null,
    };

    if (selected) {
      editor.chain().focus().updateAttributes("youtube", attrs).run();
    } else {
      editor
        .chain()
        .focus()
        .command(({ tr, state }) => {
          insertBlockNode(tr, state.schema.nodes.youtube.create(attrs));
          return true;
        })
        .run();
    }

    onClose();
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
          apply();
        }
        if (event.key === "Escape") {
          event.preventDefault();
          close();
        }
      }}
    >
      <div className="space-y-1.5">
        <Label htmlFor={`${id}-url`}>YouTube bağlantısı</Label>
        <Input
          id={`${id}-url`}
          type="text"
          inputMode="url"
          autoFocus
          value={url}
          placeholder="https://www.youtube.com/watch?v=…"
          spellCheck={false}
          aria-invalid={error?.field === "url" ? true : undefined}
          aria-describedby={
            error?.field === "url" ? `${errorId} ${id}-url-help` : `${id}-url-help`
          }
          onChange={(event) => setUrl(event.target.value)}
        />
        <p id={`${id}-url-help`} className="text-xs text-muted-foreground">
          Video, gizlilik odaklı youtube-nocookie.com alan adından gömülür.
          Bağlantıdaki başlangıç zamanı (ör. ?t=90) korunur.
        </p>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor={`${id}-title`}>Video başlığı</Label>
        <Input
          id={`${id}-title`}
          type="text"
          value={title}
          maxLength={maxVideoTitleLength}
          aria-invalid={error?.field === "title" ? true : undefined}
          aria-describedby={error?.field === "title" ? errorId : undefined}
          onChange={(event) => setTitle(event.target.value)}
          placeholder="Videoda ne anlatılıyor?"
        />
      </div>

      {error ? (
        <p id={errorId} role="alert" className="text-sm text-destructive">
          {error.message}
        </p>
      ) : null}

      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" size="sm" onClick={apply}>
          {selected ? "Uygula" : "Videoyu ekle"}
        </Button>
        {selected ? (
          <Button type="button" size="sm" variant="outline" onClick={remove}>
            <Trash2 aria-hidden="true" />
            Videoyu kaldır
          </Button>
        ) : null}
        <Button type="button" size="sm" variant="ghost" onClick={close}>
          Vazgeç
        </Button>
      </div>
    </div>
  );
}
