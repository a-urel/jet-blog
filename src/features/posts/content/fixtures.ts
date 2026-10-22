// Shared body fixtures. Unit tests run them through the TypeScript validator
// and the Tiptap schema; the RLS suite sends them to the database RPCs. A
// fixture that passes in one place and fails in another means the allowlists
// have drifted.

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
];

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
    name: "image node is deferred",
    doc: {
      type: "doc",
      content: [{ type: "image", attrs: { src: "https://example.com/a.png" } }],
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
