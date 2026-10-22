"use client";

import {
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import { EditorContent, useEditor, useEditorState, type Editor } from "@tiptap/react";
import {
  Bold,
  Code,
  Heading2,
  Heading3,
  ImagePlus,
  Italic,
  Link2,
  List,
  ListOrdered,
  Minus,
  Quote,
  Redo2,
  SquareCode,
  Strikethrough,
  Undo2,
  Unlink,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { postBodyExtensions } from "@/features/posts/content/editor-extensions";
import {
  isSafeHref,
  type BodyDocument,
  type ImageAttrs,
} from "@/features/posts/content/schema";
import { cn } from "@/lib/utils";
import { PostImagePanel } from "./post-image-panel";

type PostBodyEditorProps = {
  id: string;
  labelId: string;
  initialContent: BodyDocument;
  invalid?: boolean;
  describedBy?: string;
};

type ToolbarButtonProps = {
  label: string;
  active?: boolean;
  disabled?: boolean;
  onClick: () => void;
  children: ReactNode;
};

function ToolbarButton({
  label,
  active,
  disabled,
  onClick,
  children,
}: ToolbarButtonProps) {
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon-sm"
      aria-label={label}
      title={label}
      aria-pressed={active === undefined ? undefined : active}
      disabled={disabled}
      // Keep the editor selection while clicking a toolbar button.
      onMouseDown={(event) => event.preventDefault()}
      onClick={onClick}
      data-toolbar-item=""
      tabIndex={-1}
      className={cn(
        active && "bg-accent text-accent-foreground ring-1 ring-ring/50",
      )}
    >
      {children}
    </Button>
  );
}

// Users often type "example.com"; treat a bare host as https. Everything else
// must already pass the shared allowlist.
function normalizeHrefInput(value: string): string | null {
  const href = value.trim();
  if (href.length === 0) return null;
  if (isSafeHref(href)) return href;

  const withProtocol = `https://${href}`;
  return /^[^\s/:]+\.[^\s/:]+/.test(href) && isSafeHref(withProtocol)
    ? withProtocol
    : null;
}

function useToolbarState(editor: Editor | null) {
  return useEditorState({
    editor,
    selector: ({ editor: current }) => {
      if (!current) return null;

      return {
        bold: current.isActive("bold"),
        italic: current.isActive("italic"),
        strike: current.isActive("strike"),
        code: current.isActive("code"),
        link: current.isActive("link"),
        heading2: current.isActive("heading", { level: 2 }),
        heading3: current.isActive("heading", { level: 3 }),
        bulletList: current.isActive("bulletList"),
        orderedList: current.isActive("orderedList"),
        blockquote: current.isActive("blockquote"),
        codeBlock: current.isActive("codeBlock"),
        image: current.isActive("image"),
        canUndo: current.can().undo(),
        canRedo: current.can().redo(),
      };
    },
  });
}

export function PostBodyEditor({
  id,
  labelId,
  initialContent,
  invalid,
  describedBy,
}: PostBodyEditorProps) {
  const [serialized, setSerialized] = useState(() =>
    JSON.stringify(initialContent),
  );
  const [linkOpen, setLinkOpen] = useState(false);
  const [linkValue, setLinkValue] = useState("");
  const [linkError, setLinkError] = useState<string | null>(null);
  // null: closed; "insert": upload a new image; otherwise the selected image.
  const [imagePanel, setImagePanel] = useState<
    { mode: "insert" } | { mode: "edit"; attrs: ImageAttrs } | null
  >(null);
  const [imagePanelKey, setImagePanelKey] = useState(0);
  const toolbarRef = useRef<HTMLDivElement>(null);

  const editor = useEditor({
    extensions: postBodyExtensions,
    content: initialContent,
    // Next.js renders this Client Component on the server first; Tiptap must
    // wait for the browser to avoid a hydration mismatch.
    immediatelyRender: false,
    editorProps: {
      attributes: {
        id,
        role: "textbox",
        "aria-multiline": "true",
        "aria-labelledby": labelId,
        ...(describedBy ? { "aria-describedby": describedBy } : {}),
        ...(invalid ? { "aria-invalid": "true" } : {}),
        class:
          "post-body min-h-64 px-4 py-3 outline-none [&_.ProseMirror-selectednode]:ring-2 [&_.ProseMirror-selectednode]:ring-ring",
      },
    },
    onUpdate: ({ editor: current }) => {
      setSerialized(JSON.stringify(current.getJSON()));
    },
  });

  const state = useToolbarState(editor);

  function openLinkForm() {
    if (!editor) return;
    setLinkValue((editor.getAttributes("link").href as string | undefined) ?? "");
    setLinkError(null);
    setImagePanel(null);
    setLinkOpen(true);
  }

  function openImagePanel() {
    if (!editor) return;
    setLinkOpen(false);
    setImagePanelKey((key) => key + 1);
    setImagePanel(
      editor.isActive("image")
        ? { mode: "edit", attrs: editor.getAttributes("image") as ImageAttrs }
        : { mode: "insert" },
    );
  }

  function applyLink() {
    if (!editor) return;
    const href = normalizeHrefInput(linkValue);

    if (!href) {
      setLinkError(
        "Yalnızca http(s), mailto, site içi (/...) veya sayfa içi (#...) bağlantılar desteklenir.",
      );
      return;
    }

    editor.chain().focus().extendMarkRange("link").setLink({ href }).run();
    setLinkOpen(false);
  }

  function removeLink() {
    editor?.chain().focus().extendMarkRange("link").unsetLink().run();
    setLinkOpen(false);
  }

  // Roving focus: Tab enters and leaves the toolbar once; arrow keys, Home, and
  // End move between buttons, matching the WAI-ARIA toolbar pattern.
  function handleToolbarKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const items = Array.from(
      toolbarRef.current?.querySelectorAll<HTMLButtonElement>(
        "[data-toolbar-item]:not(:disabled)",
      ) ?? [],
    );
    const index = items.indexOf(document.activeElement as HTMLButtonElement);
    let next: number | null = null;

    if (event.key === "ArrowRight") next = (index + 1) % items.length;
    if (event.key === "ArrowLeft") next = (index - 1 + items.length) % items.length;
    if (event.key === "Home") next = 0;
    if (event.key === "End") next = items.length - 1;
    if (next === null || items.length === 0) return;

    event.preventDefault();
    items[next]?.focus();
  }

  function handleToolbarFocus() {
    const items = toolbarRef.current?.querySelectorAll<HTMLButtonElement>(
      "[data-toolbar-item]:not(:disabled)",
    );
    if (!items || items.length === 0) return;
    if (!Array.from(items).includes(document.activeElement as HTMLButtonElement)) {
      items[0].focus();
    }
  }

  const disabled = !editor || !state;

  return (
    <div className="space-y-2">
      <input type="hidden" name="body" value={serialized} />
      <div
        className={cn(
          "overflow-hidden rounded-md border border-input shadow-xs focus-within:border-ring focus-within:ring-[3px] focus-within:ring-ring/50 dark:bg-input/30",
          invalid && "border-destructive",
        )}
      >
        <div
          ref={toolbarRef}
          role="toolbar"
          aria-label="Biçimlendirme"
          aria-controls={id}
          tabIndex={disabled ? -1 : 0}
          onFocus={handleToolbarFocus}
          onKeyDown={handleToolbarKeyDown}
          className="flex flex-wrap items-center gap-0.5 border-b bg-muted/40 px-1.5 py-1 outline-none"
        >
          <ToolbarButton
            label="Başlık 2"
            active={state?.heading2}
            disabled={disabled}
            onClick={() => editor?.chain().focus().toggleHeading({ level: 2 }).run()}
          >
            <Heading2 aria-hidden="true" />
          </ToolbarButton>
          <ToolbarButton
            label="Başlık 3"
            active={state?.heading3}
            disabled={disabled}
            onClick={() => editor?.chain().focus().toggleHeading({ level: 3 }).run()}
          >
            <Heading3 aria-hidden="true" />
          </ToolbarButton>
          <span aria-hidden="true" className="mx-1 h-5 w-px bg-border" />
          <ToolbarButton
            label="Kalın"
            active={state?.bold}
            disabled={disabled}
            onClick={() => editor?.chain().focus().toggleBold().run()}
          >
            <Bold aria-hidden="true" />
          </ToolbarButton>
          <ToolbarButton
            label="Eğik"
            active={state?.italic}
            disabled={disabled}
            onClick={() => editor?.chain().focus().toggleItalic().run()}
          >
            <Italic aria-hidden="true" />
          </ToolbarButton>
          <ToolbarButton
            label="Üstü çizili"
            active={state?.strike}
            disabled={disabled}
            onClick={() => editor?.chain().focus().toggleStrike().run()}
          >
            <Strikethrough aria-hidden="true" />
          </ToolbarButton>
          <ToolbarButton
            label="Satır içi kod"
            active={state?.code}
            disabled={disabled}
            onClick={() => editor?.chain().focus().toggleCode().run()}
          >
            <Code aria-hidden="true" />
          </ToolbarButton>
          <ToolbarButton
            label="Bağlantı"
            active={state?.link}
            disabled={disabled}
            onClick={openLinkForm}
          >
            <Link2 aria-hidden="true" />
          </ToolbarButton>
          <span aria-hidden="true" className="mx-1 h-5 w-px bg-border" />
          <ToolbarButton
            label="Madde listesi"
            active={state?.bulletList}
            disabled={disabled}
            onClick={() => editor?.chain().focus().toggleBulletList().run()}
          >
            <List aria-hidden="true" />
          </ToolbarButton>
          <ToolbarButton
            label="Numaralı liste"
            active={state?.orderedList}
            disabled={disabled}
            onClick={() => editor?.chain().focus().toggleOrderedList().run()}
          >
            <ListOrdered aria-hidden="true" />
          </ToolbarButton>
          <ToolbarButton
            label="Alıntı"
            active={state?.blockquote}
            disabled={disabled}
            onClick={() => editor?.chain().focus().toggleBlockquote().run()}
          >
            <Quote aria-hidden="true" />
          </ToolbarButton>
          <ToolbarButton
            label="Kod bloğu"
            active={state?.codeBlock}
            disabled={disabled}
            onClick={() => editor?.chain().focus().toggleCodeBlock().run()}
          >
            <SquareCode aria-hidden="true" />
          </ToolbarButton>
          <ToolbarButton
            label="Ayırıcı çizgi"
            disabled={disabled}
            onClick={() => editor?.chain().focus().setHorizontalRule().run()}
          >
            <Minus aria-hidden="true" />
          </ToolbarButton>
          <ToolbarButton
            label={state?.image ? "Görseli düzenle" : "Görsel ekle"}
            active={state?.image}
            disabled={disabled}
            onClick={openImagePanel}
          >
            <ImagePlus aria-hidden="true" />
          </ToolbarButton>
          <span aria-hidden="true" className="mx-1 h-5 w-px bg-border" />
          <ToolbarButton
            label="Geri al"
            disabled={disabled || !state?.canUndo}
            onClick={() => editor?.chain().focus().undo().run()}
          >
            <Undo2 aria-hidden="true" />
          </ToolbarButton>
          <ToolbarButton
            label="Yinele"
            disabled={disabled || !state?.canRedo}
            onClick={() => editor?.chain().focus().redo().run()}
          >
            <Redo2 aria-hidden="true" />
          </ToolbarButton>
        </div>

        {linkOpen ? (
          <div className="space-y-2 border-b px-3 py-3">
            <Label htmlFor={`${id}-link`}>Bağlantı adresi</Label>
            <div className="flex flex-wrap items-center gap-2">
              <Input
                id={`${id}-link`}
                type="text"
                inputMode="url"
                autoFocus
                value={linkValue}
                placeholder="https://"
                spellCheck={false}
                className="min-w-56 flex-1"
                aria-invalid={linkError ? true : undefined}
                aria-describedby={linkError ? `${id}-link-error` : undefined}
                onChange={(event) => setLinkValue(event.target.value)}
                onKeyDown={(event) => {
                  // Enter must not submit the surrounding post form.
                  if (event.key === "Enter") {
                    event.preventDefault();
                    applyLink();
                  }
                  if (event.key === "Escape") {
                    event.preventDefault();
                    setLinkOpen(false);
                    editor?.commands.focus();
                  }
                }}
              />
              <Button type="button" size="sm" onClick={applyLink}>
                Uygula
              </Button>
              {state?.link ? (
                <Button type="button" size="sm" variant="outline" onClick={removeLink}>
                  <Unlink aria-hidden="true" />
                  Kaldır
                </Button>
              ) : null}
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={() => {
                  setLinkOpen(false);
                  editor?.commands.focus();
                }}
              >
                Vazgeç
              </Button>
            </div>
            {linkError ? (
              <p id={`${id}-link-error`} className="text-sm text-destructive">
                {linkError}
              </p>
            ) : null}
          </div>
        ) : null}

        {editor && imagePanel ? (
          <PostImagePanel
            key={imagePanelKey}
            editor={editor}
            selected={imagePanel.mode === "edit" ? imagePanel.attrs : null}
            onClose={() => setImagePanel(null)}
          />
        ) : null}

        {editor ? (
          <EditorContent editor={editor} />
        ) : (
          <div
            aria-hidden="true"
            className="min-h-64 px-4 py-3 text-sm text-muted-foreground"
          >
            Editör yükleniyor…
          </div>
        )}
      </div>
    </div>
  );
}
