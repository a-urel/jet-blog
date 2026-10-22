// Shared body fixtures. Unit tests run them through the TypeScript validator
// and the Tiptap schema; the RLS suite sends them to the database RPCs. A
// fixture that passes in one place and fails in another means the allowlists
// have drifted.
//
// Image fixtures reference these media ids. The database requires referenced
// media rows to exist, so the RLS suite registers them before sending bodies.
export const fixtureMediaIds = [
  "6f1c1e2a-3b4d-4c5e-8f60-718293a4b5c6",
  "0a1b2c3d-4e5f-4a6b-9c7d-8e9f0a1b2c3d",
] as const;

const imageAttrs = {
  mediaId: fixtureMediaIds[0],
  width: 1200,
  height: 800,
  alt: "Deniz kıyısında gün batımı",
};

export const validBodyFixtures: ReadonlyArray<{ name: string; doc: unknown }> = [
  {
    name: "empty paragraph",
    doc: { type: "doc", content: [{ type: "paragraph" }] },
  },
  {
    name: "formatted text and safe links",
    doc: {
      type: "doc",
      content: [
        {
          type: "heading",
          attrs: { level: 2 },
          content: [{ type: "text", text: "Başlık" }],
        },
        {
          type: "paragraph",
          content: [
            { type: "text", text: "Kalın", marks: [{ type: "bold" }] },
            { type: "text", text: " ve " },
            {
              type: "text",
              text: "eğik bağlantı",
              // Canonical ProseMirror mark order: link sorts before italic.
              marks: [
                { type: "link", attrs: { href: "https://example.com/a?b=1" } },
                { type: "italic" },
              ],
            },
            { type: "hardBreak" },
            {
              type: "text",
              text: "iç bağlantı",
              marks: [{ type: "link", attrs: { href: "/posts/ornek" } }],
            },
            { type: "text", text: " " },
            {
              type: "text",
              text: "posta",
              marks: [{ type: "link", attrs: { href: "mailto:a@example.com" } }],
            },
            { type: "text", text: " " },
            {
              type: "text",
              text: "kod",
              marks: [{ type: "code" }],
            },
            { type: "text", text: " " },
            {
              type: "text",
              text: "çizik",
              marks: [{ type: "strike" }],
            },
          ],
        },
      ],
    },
  },
  {
    name: "nested lists, quote, code block, and rule",
    doc: {
      type: "doc",
      content: [
        {
          type: "bulletList",
          content: [
            {
              type: "listItem",
              content: [
                { type: "paragraph", content: [{ type: "text", text: "Bir" }] },
                {
                  type: "orderedList",
                  attrs: { start: 3 },
                  content: [
                    {
                      type: "listItem",
                      content: [
                        {
                          type: "paragraph",
                          content: [{ type: "text", text: "Üç" }],
                        },
                      ],
                    },
                  ],
                },
              ],
            },
          ],
        },
        {
          type: "blockquote",
          content: [
            { type: "paragraph", content: [{ type: "text", text: "Alıntı" }] },
          ],
        },
        {
          type: "codeBlock",
          attrs: { language: "ts" },
          content: [{ type: "text", text: "const a = 1;\nconsole.log(a);" }],
        },
        { type: "horizontalRule" },
        {
          type: "heading",
          attrs: { level: 4 },
          content: [{ type: "text", text: "Son" }],
        },
      ],
    },
  },
  {
    name: "image with alt text and caption",
    doc: {
      type: "doc",
      content: [
        { type: "paragraph", content: [{ type: "text", text: "Önce" }] },
        {
          type: "image",
          attrs: { ...imageAttrs, caption: "Fotoğraf: örnek <b>kaynak</b>" },
        },
      ],
    },
  },
  {
    name: "decorative image in a quote and an image in a list item",
    doc: {
      type: "doc",
      content: [
        {
          type: "blockquote",
          content: [
            {
              type: "image",
              attrs: {
                mediaId: fixtureMediaIds[1],
                width: 640,
                height: 480,
                alt: "",
                decorative: true,
              },
            },
          ],
        },
        {
          type: "bulletList",
          content: [
            {
              type: "listItem",
              content: [
                { type: "paragraph", content: [{ type: "text", text: "Madde" }] },
                { type: "image", attrs: imageAttrs },
              ],
            },
          ],
        },
      ],
    },
  },
];

function imageWith(attrs: unknown) {
  return { type: "doc", content: [{ type: "image", attrs }] };
}

function paragraphWith(node: unknown) {
  return { type: "doc", content: [{ type: "paragraph", content: [node] }] };
}

function linkTo(href: string) {
  return paragraphWith({
    type: "text",
    text: "bağlantı",
    marks: [{ type: "link", attrs: { href } }],
  });
}

export const invalidBodyFixtures: ReadonlyArray<{ name: string; doc: unknown }> = [
  { name: "non-object root", doc: [] },
  { name: "non-doc root", doc: { type: "paragraph" } },
  { name: "empty doc", doc: { type: "doc", content: [] } },
  {
    name: "unknown node",
    doc: { type: "doc", content: [{ type: "script", content: [] }] },
  },
  {
    name: "image with a URL instead of a media reference",
    doc: imageWith({ src: "https://example.com/a.png", width: 1, height: 1, alt: "a" }),
  },
  {
    name: "image with an extra src attribute",
    doc: imageWith({ ...imageAttrs, src: "https://example.com/a.png" }),
  },
  { name: "image without attributes", doc: { type: "doc", content: [{ type: "image" }] } },
  { name: "image without alt text", doc: imageWith({ ...imageAttrs, alt: undefined }) },
  { name: "image with blank alt text", doc: imageWith({ ...imageAttrs, alt: "   " }) },
  { name: "image with too long alt text", doc: imageWith({ ...imageAttrs, alt: "a".repeat(301) }) },
  { name: "image alt text with control character", doc: imageWith({ ...imageAttrs, alt: "a\u0007" }) },
  {
    name: "decorative image with alt text",
    doc: imageWith({ ...imageAttrs, decorative: true }),
  },
  {
    name: "image with decorative false",
    doc: imageWith({ ...imageAttrs, alt: "", decorative: false }),
  },
  { name: "image with non-uuid media id", doc: imageWith({ ...imageAttrs, mediaId: "../secret" }) },
  {
    name: "image with uppercase media id",
    doc: imageWith({ ...imageAttrs, mediaId: fixtureMediaIds[0].toUpperCase() }),
  },
  { name: "image with zero width", doc: imageWith({ ...imageAttrs, width: 0 }) },
  { name: "image with fractional height", doc: imageWith({ ...imageAttrs, height: 1.5 }) },
  { name: "image with string width", doc: imageWith({ ...imageAttrs, width: "1200" }) },
  { name: "image with oversized width", doc: imageWith({ ...imageAttrs, width: 10001 }) },
  { name: "image with empty caption", doc: imageWith({ ...imageAttrs, caption: "" }) },
  { name: "image with blank caption", doc: imageWith({ ...imageAttrs, caption: " " }) },
  { name: "image with too long caption", doc: imageWith({ ...imageAttrs, caption: "a".repeat(501) }) },
  {
    name: "image with content",
    doc: {
      type: "doc",
      content: [{ type: "image", attrs: imageAttrs, content: [{ type: "paragraph" }] }],
    },
  },
  { name: "image inside a paragraph", doc: paragraphWith({ type: "image", attrs: imageAttrs }) },
  {
    name: "list item starting with an image",
    doc: {
      type: "doc",
      content: [
        {
          type: "bulletList",
          content: [{ type: "listItem", content: [{ type: "image", attrs: imageAttrs }] }],
        },
      ],
    },
  },
  {
    name: "html node",
    doc: paragraphWith({ type: "html", text: "<img src=x onerror=alert(1)>" }),
  },
  { name: "unknown mark", doc: paragraphWith({ type: "text", text: "a", marks: [{ type: "underline" }] }) },
  { name: "duplicate mark", doc: paragraphWith({ type: "text", text: "a", marks: [{ type: "bold" }, { type: "bold" }] }) },
  { name: "attrs on bold", doc: paragraphWith({ type: "text", text: "a", marks: [{ type: "bold", attrs: { x: 1 } }] }) },
  { name: "javascript link", doc: linkTo("javascript:alert(1)") },
  { name: "mixed-case javascript link", doc: linkTo("JaVaScRiPt:alert(1)") },
  { name: "data link", doc: linkTo("data:text/html,<script>alert(1)</script>") },
  { name: "protocol-relative link", doc: linkTo("//evil.example") },
  { name: "backslash link", doc: linkTo("/\\evil.example") },
  { name: "link with whitespace", doc: linkTo("https://a.example/ b") },
  { name: "link with control character", doc: linkTo("https://a.example/\u0007") },
  { name: "empty link", doc: linkTo("") },
  {
    name: "extra link attribute",
    doc: paragraphWith({
      type: "text",
      text: "a",
      marks: [{ type: "link", attrs: { href: "https://a.example", onclick: "x" } }],
    }),
  },
  {
    name: "heading level 1",
    doc: { type: "doc", content: [{ type: "heading", attrs: { level: 1 } }] },
  },
  {
    name: "heading without level",
    doc: { type: "doc", content: [{ type: "heading" }] },
  },
  {
    name: "unknown attribute on paragraph",
    doc: { type: "doc", content: [{ type: "paragraph", attrs: { style: "color:red" } }] },
  },
  {
    name: "unknown key on node",
    doc: { type: "doc", content: [{ type: "paragraph", html: "<b>x</b>" }] },
  },
  { name: "empty text", doc: paragraphWith({ type: "text", text: "" }) },
  { name: "non-string text", doc: paragraphWith({ type: "text", text: 42 }) },
  {
    name: "text directly in doc",
    doc: { type: "doc", content: [{ type: "text", text: "a" }] },
  },
  {
    name: "paragraph inside paragraph",
    doc: paragraphWith({ type: "paragraph" }),
  },
  {
    name: "list without items",
    doc: { type: "doc", content: [{ type: "bulletList", content: [] }] },
  },
  {
    name: "list item starting with heading",
    doc: {
      type: "doc",
      content: [
        {
          type: "bulletList",
          content: [
            {
              type: "listItem",
              content: [{ type: "heading", attrs: { level: 2 } }],
            },
          ],
        },
      ],
    },
  },
  {
    name: "marked text in code block",
    doc: {
      type: "doc",
      content: [
        {
          type: "codeBlock",
          content: [{ type: "text", text: "a", marks: [{ type: "bold" }] }],
        },
      ],
    },
  },
  {
    name: "unsafe code block language",
    doc: {
      type: "doc",
      content: [{ type: "codeBlock", attrs: { language: "\"><script>" } }],
    },
  },
  {
    name: "ordered list start out of range",
    doc: {
      type: "doc",
      content: [
        {
          type: "orderedList",
          attrs: { start: 0 },
          content: [{ type: "listItem", content: [{ type: "paragraph" }] }],
        },
      ],
    },
  },
  {
    name: "content on horizontal rule",
    doc: {
      type: "doc",
      content: [{ type: "horizontalRule", content: [{ type: "paragraph" }] }],
    },
  },
  {
    name: "nested too deeply",
    doc: (() => {
      let node: unknown = { type: "paragraph" };
      for (let index = 0; index < 30; index += 1) {
        node = { type: "blockquote", content: [node] };
      }
      return { type: "doc", content: [node] };
    })(),
  },
];
