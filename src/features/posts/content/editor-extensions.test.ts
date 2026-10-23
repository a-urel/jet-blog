import { getSchema } from "@tiptap/core";
import { describe, expect, it } from "vitest";

import { postBodyExtensions } from "./editor-extensions";
import { validBodyFixtures } from "./fixtures";
import {
  markTypes,
  nodeTypes,
  normalizeEditorDocument,
  validateBodyDocument,
} from "./schema";

const schema = getSchema(postBodyExtensions);

describe("editor schema and stored-body allowlist", () => {
  it("defines exactly the allowlisted nodes", () => {
    expect(Object.keys(schema.nodes).sort()).toEqual([...nodeTypes].sort());
  });

  it("defines exactly the allowlisted marks", () => {
    expect(Object.keys(schema.marks).sort()).toEqual([...markTypes].sort());
  });

  it.each(validBodyFixtures)(
    "loads $name in the editor and round-trips to the same document",
    ({ doc }) => {
      const node = schema.nodeFromJSON(doc);
      node.check();

      const roundTripped = normalizeEditorDocument(node.toJSON());

      expect(roundTripped).toEqual(doc);
      expect(validateBodyDocument(roundTripped).ok).toBe(true);
    },
  );

  it("defines image as a block atom", () => {
    expect(schema.nodes.image.isBlock).toBe(true);
    expect(schema.nodes.image.isAtom).toBe(true);
  });

  it("defines youtube as a block atom", () => {
    expect(schema.nodes.youtube.isBlock).toBe(true);
    expect(schema.nodes.youtube.isAtom).toBe(true);
  });

  it("has no parse rule for iframes, embeds, or objects", () => {
    const tags = Object.values(schema.nodes).flatMap((type) =>
      (type.spec.parseDOM ?? []).map((rule) => rule.tag ?? ""),
    );

    expect(tags.filter((tag) => /iframe|embed|object/i.test(tag))).toEqual([]);
    expect(schema.nodes.youtube.spec.parseDOM?.map((rule) => rule.tag)).toEqual([
      "figure[data-youtube-video-id]",
    ]);
  });

  describe("youtube copy-paste markup", () => {
    const rule = schema.nodes.youtube.spec.parseDOM![0];
    const getAttrs = rule.getAttrs as (element: HTMLElement) => unknown;

    function figure(attributes: Record<string, string>, iframeTitle?: string) {
      return {
        getAttribute: (name: string) => attributes[name] ?? null,
        querySelector: (selector: string) =>
          selector === "iframe" && iframeTitle !== undefined
            ? { getAttribute: (name: string) => (name === "title" ? iframeTitle : null) }
            : null,
      } as unknown as HTMLElement;
    }

    it("parses a valid id, title, and start", () => {
      expect(
        getAttrs(
          figure(
            { "data-youtube-video-id": "dQw4w9WgXcQ", "data-youtube-start": "90" },
            "Örnek",
          ),
        ),
      ).toEqual({ videoId: "dQw4w9WgXcQ", title: "Örnek", start: 90 });
    });

    it.each(["javascript:alert(1)", "dQw4w9WgXc", "https://youtu.be/dQw4w9WgXcQ", ""])(
      "rejects the id %j",
      (videoId) => {
        expect(getAttrs(figure({ "data-youtube-video-id": videoId }, "t"))).toBe(false);
      },
    );

    it("drops an out-of-range start", () => {
      expect(
        getAttrs(
          figure({ "data-youtube-video-id": "dQw4w9WgXcQ", "data-youtube-start": "-3" }, "t"),
        ),
      ).toMatchObject({ start: null });
    });
  });

  it("renders the privacy-enhanced embed in the node view", () => {
    const node = schema.nodeFromJSON({
      type: "youtube",
      attrs: { videoId: "dQw4w9WgXcQ", title: "Örnek", start: 42 },
    });
    const rendered = JSON.stringify(schema.nodes.youtube.spec.toDOM!(node));

    expect(rendered).toContain("https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ?start=42");
    expect(rendered).toContain('"title":"Örnek"');
    expect(rendered).toContain('"loading":"lazy"');
    expect(rendered).toContain('"sandbox"');
    expect(rendered).toContain('"referrerpolicy":"strict-origin-when-cross-origin"');
    expect(rendered).not.toContain("youtube.com/watch");
  });
});
