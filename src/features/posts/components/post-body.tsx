import type { ReactNode } from "react";
import Image from "next/image";

import { mediaPublicUrl } from "@/features/media/url";

import {
  currentContentVersion,
  validateBodyDocument,
  type BlockNode,
  type ImageAttrs,
  type InlineNode,
  type ListItemNode,
  type TextNode,
  type YouTubeAttrs,
} from "../content/schema";
import {
  youtubeEmbedUrl,
  youtubeIframeAllow,
  youtubeIframeReferrerPolicy,
  youtubeIframeSandbox,
} from "../content/youtube";

// Read-only renderer shared by the member preview and public pages. It imports
// no Tiptap code, so public HTML is complete without the editor bundle. Every
// document is re-validated against the shared allowlist before rendering; an
// unsupported version or invalid document shows a controlled fallback instead.

// Bodies render inside a max-w-3xl article with horizontal padding.
const imageSizes = "(min-width: 48rem) 45rem, 100vw";

function renderText(node: TextNode, key: number): ReactNode {
  let element: ReactNode = node.text;

  // Apply marks innermost-first so the link wraps the formatted text.
  for (const mark of [...(node.marks ?? [])].reverse()) {
    switch (mark.type) {
      case "code":
        element = <code>{element}</code>;
        break;
      case "strike":
        element = <s>{element}</s>;
        break;
      case "italic":
        element = <em>{element}</em>;
        break;
      case "bold":
        element = <strong>{element}</strong>;
        break;
      case "link": {
        const external = !mark.attrs.href.startsWith("/") && !mark.attrs.href.startsWith("#");
        element = (
          <a
            href={mark.attrs.href}
            rel={external ? "noopener noreferrer nofollow" : undefined}
          >
            {element}
          </a>
        );
        break;
      }
    }
  }

  return <span key={key}>{element}</span>;
}

function renderInline(nodes: InlineNode[] | undefined): ReactNode {
  return nodes?.map((node, index) =>
    node.type === "hardBreak" ? <br key={index} /> : renderText(node, index),
  );
}

function renderListItems(items: ListItemNode[]): ReactNode {
  return items.map((item, index) => (
    <li key={index}>{renderBlocks(item.content)}</li>
  ));
}

// Images go through the framework image component, which serves resized
// variants from the public media URL allowed in next.config.ts. Width and height
// come from the node, so the layout reserves space before the image loads.
function renderImage(attrs: ImageAttrs, key: number): ReactNode {
  const src = mediaPublicUrl(attrs.mediaId);
  const alt = attrs.decorative ? "" : attrs.alt;

  return (
    <figure key={key}>
      {src ? (
        <Image
          src={src}
          alt={alt}
          width={attrs.width}
          height={attrs.height}
          sizes={imageSizes}
        />
      ) : (
        <span
          role={alt ? "img" : undefined}
          aria-label={alt || undefined}
          aria-hidden={alt ? undefined : true}
          className="block rounded-lg border border-dashed px-4 py-6 text-sm text-muted-foreground"
        >
          Görsel şu anda yüklenemiyor.
        </span>
      )}
      {attrs.caption ? <figcaption>{attrs.caption}</figcaption> : null}
    </figure>
  );
}

// Same structure as the editor node view (PostYouTube in
// ../content/editor-extensions.ts). The embed URL is derived from the
// validated id on the privacy-enhanced domain; the wrapper keeps 16:9.
function renderYouTube(attrs: YouTubeAttrs, key: number): ReactNode {
  const src = youtubeEmbedUrl(attrs.videoId, attrs.start);
  if (!src) return null;

  return (
    <figure key={key} className="post-video">
      <div className="post-video-frame">
        <iframe
          src={src}
          title={attrs.title}
          loading="lazy"
          allow={youtubeIframeAllow}
          referrerPolicy={youtubeIframeReferrerPolicy}
          sandbox={youtubeIframeSandbox}
        />
      </div>
    </figure>
  );
}

function renderBlock(node: BlockNode, key: number): ReactNode {
  switch (node.type) {
    case "paragraph":
      return <p key={key}>{renderInline(node.content)}</p>;
    case "heading": {
      const Heading = `h${node.attrs.level}` as "h2" | "h3" | "h4";
      return <Heading key={key}>{renderInline(node.content)}</Heading>;
    }
    case "bulletList":
      return <ul key={key}>{renderListItems(node.content)}</ul>;
    case "orderedList":
      return (
        <ol key={key} start={node.attrs?.start}>
          {renderListItems(node.content)}
        </ol>
      );
    case "blockquote":
      return <blockquote key={key}>{renderBlocks(node.content)}</blockquote>;
    case "codeBlock":
      return (
        <pre key={key}>
          <code data-language={node.attrs?.language}>
            {node.content?.map((text) => text.text).join("")}
          </code>
        </pre>
      );
    case "horizontalRule":
      return <hr key={key} />;
    case "image":
      return renderImage(node.attrs, key);
    case "youtube":
      return renderYouTube(node.attrs, key);
  }
}

function renderBlocks(nodes: BlockNode[]): ReactNode {
  return nodes.map(renderBlock);
}

export function PostBody({
  body,
  contentVersion,
}: {
  body: unknown;
  contentVersion: number;
}) {
  const validation =
    contentVersion === currentContentVersion ? validateBodyDocument(body) : null;

  if (!validation?.ok) {
    return (
      <div
        role="note"
        className="rounded-lg border border-dashed px-4 py-6 text-sm text-muted-foreground"
      >
        Bu yazının içeriği şu anda görüntülenemiyor.
      </div>
    );
  }

  return <div className="post-body">{renderBlocks(validation.doc.content)}</div>;
}
