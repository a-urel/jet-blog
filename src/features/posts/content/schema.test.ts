import { describe, expect, it } from "vitest";

import { invalidBodyFixtures, validBodyFixtures } from "./fixtures";
import {
  emptyBodyDocument,
  isSafeHref,
  maxBodyLength,
  normalizeEditorDocument,
  parseSubmittedBody,
  validateBodyDocument,
} from "./schema";

describe("validateBodyDocument", () => {
  it.each(validBodyFixtures)("accepts $name", ({ doc }) => {
    expect(validateBodyDocument(doc)).toEqual({ ok: true, doc });
  });

  it.each(invalidBodyFixtures)("rejects $name", ({ doc }) => {
    expect(validateBodyDocument(doc).ok).toBe(false);
  });

  it("rejects an oversized document", () => {
    const text = "a".repeat(maxBodyLength);
    const result = validateBodyDocument({
      type: "doc",
      content: [{ type: "paragraph", content: [{ type: "text", text }] }],
    });

    expect(result).toEqual({ ok: false, error: "Document is too large" });
  });
});

describe("isSafeHref", () => {
  it.each([
    "https://example.com",
    "HTTP://EXAMPLE.COM/a",
    "mailto:a@example.com",
    "/",
    "/posts/ornek#bolum",
    "#bolum",
  ])("accepts %s", (href) => {
    expect(isSafeHref(href)).toBe(true);
  });

  it.each([
    "javascript:alert(1)",
    " javascript:alert(1)",
    "vbscript:x",
    "data:text/html,x",
    "//evil.example",
    "/\\evil.example",
    "example.com",
    "ftp://example.com",
    "https://a.example/\n",
    `https://a.example/${"a".repeat(2048)}`,
  ])("rejects %s", (href) => {
    expect(isSafeHref(href)).toBe(false);
  });
});

describe("normalizeEditorDocument", () => {
  it("drops editor-only defaults and keeps set values", () => {
    const editorOutput = {
      type: "doc",
      content: [
        {
          type: "orderedList",
          attrs: { start: 1, type: null },
          content: [
            {
              type: "listItem",
              content: [
                {
                  type: "paragraph",
                  content: [
                    {
                      type: "text",
                      text: "a",
                      marks: [
                        {
                          type: "link",
                          attrs: {
                            href: "https://example.com",
                            target: "_blank",
                            rel: "noopener noreferrer nofollow",
                            class: null,
                            title: null,
                          },
                        },
                      ],
                    },
                  ],
                },
              ],
            },
          ],
        },
        { type: "codeBlock", attrs: { language: null } },
        { type: "orderedList", attrs: { start: 4, type: null }, content: [] },
      ],
    };

    expect(normalizeEditorDocument(editorOutput)).toEqual({
      type: "doc",
      content: [
        {
          type: "orderedList",
          content: [
            {
              type: "listItem",
              content: [
                {
                  type: "paragraph",
                  content: [
                    {
                      type: "text",
                      text: "a",
                      marks: [
                        { type: "link", attrs: { href: "https://example.com" } },
                      ],
                    },
                  ],
                },
              ],
            },
          ],
        },
        { type: "codeBlock" },
        { type: "orderedList", attrs: { start: 4 }, content: [] },
      ],
    });
  });

  it("keeps a set link title so strict validation rejects it", () => {
    const normalized = normalizeEditorDocument({
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [
            {
              type: "text",
              text: "a",
              marks: [
                {
                  type: "link",
                  attrs: { href: "https://example.com", title: "x" },
                },
              ],
            },
          ],
        },
      ],
    });

    expect(validateBodyDocument(normalized).ok).toBe(false);
  });
});

describe("parseSubmittedBody", () => {
  it("treats an empty payload as the empty document", () => {
    expect(parseSubmittedBody("")).toEqual({ ok: true, doc: emptyBodyDocument });
  });

  it("rejects malformed JSON", () => {
    expect(parseSubmittedBody("{not json")).toEqual({
      ok: false,
      error: "Malformed JSON",
    });
  });

  it("rejects an unsafe document", () => {
    const payload = JSON.stringify({
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [
            {
              type: "text",
              text: "a",
              marks: [{ type: "link", attrs: { href: "javascript:alert(1)" } }],
            },
          ],
        },
      ],
    });

    expect(parseSubmittedBody(payload)).toEqual({
      ok: false,
      error: "Unsafe link href",
    });
  });
});
