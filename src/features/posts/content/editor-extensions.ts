import { Node, mergeAttributes } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";

import { mediaPublicUrl } from "@/features/media/url";
import { headingLevels, isSafeHref, mediaIdPattern } from "./schema";

function parseDimension(value: string | null): number | null {
  const parsed = Number.parseInt(value ?? "", 10);
  return Number.isSafeInteger(parsed) ? parsed : null;
}

// Block image that references uploaded media by id. It is not the Tiptap image
// extension: that stores a `src` URL, while stored bodies keep only the media
// id, intrinsic size, and occurrence-specific alt text and caption. Pasted
// <img> tags without a media id are dropped instead of hotlinked.
export const PostImage = Node.create({
  name: "image",
  group: "block",
  atom: true,
  draggable: true,
  selectable: true,

  addAttributes() {
    return {
      mediaId: { default: null },
      width: {
        default: null,
        parseHTML: (element) => parseDimension(element.getAttribute("width")),
      },
      height: {
        default: null,
        parseHTML: (element) => parseDimension(element.getAttribute("height")),
      },
      alt: { default: "" },
      caption: { default: null },
      decorative: { default: null },
    };
  },

  parseHTML() {
    return [
      {
        tag: "figure[data-media-id]",
        getAttrs: (element) => {
          const mediaId = element.getAttribute("data-media-id") ?? "";
          if (!mediaIdPattern.test(mediaId)) return false;

          const image = element.querySelector("img");
          const caption = element.querySelector("figcaption")?.textContent?.trim();
          const decorative = element.hasAttribute("data-decorative");

          return {
            mediaId,
            width: parseDimension(image?.getAttribute("width") ?? null),
            height: parseDimension(image?.getAttribute("height") ?? null),
            alt: decorative ? "" : (image?.getAttribute("alt") ?? ""),
            caption: caption || null,
            decorative: decorative || null,
          };
        },
      },
    ];
  },

  renderHTML({ node }) {
    const { mediaId, width, height, alt, caption, decorative } = node.attrs;
    const src = typeof mediaId === "string" ? mediaPublicUrl(mediaId) : null;
    const image = [
      "img",
      mergeAttributes({
        src: src ?? "",
        alt: alt ?? "",
        width,
        height,
        draggable: "false",
      }),
    ] as const;

    return [
      "figure",
      {
        "data-media-id": mediaId,
        ...(decorative ? { "data-decorative": "" } : {}),
      },
      image,
      ...(caption ? [["figcaption", {}, caption] as const] : []),
    ];
  },
});

// The editor schema must stay inside the stored-body allowlist in ./schema.ts.
// editor-extensions.test.ts compares the generated Tiptap schema with it.
export const postBodyExtensions = [
  StarterKit.configure({
    heading: { levels: [...headingLevels] },
    underline: false,
    link: {
      openOnClick: false,
      autolink: true,
      defaultProtocol: "https",
      isAllowedUri: (url) => isSafeHref(url),
    },
  }),
  PostImage,
];
