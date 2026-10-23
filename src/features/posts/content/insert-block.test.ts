import { getSchema } from "@tiptap/core";
import { EditorState, NodeSelection, TextSelection } from "@tiptap/pm/state";
import { describe, expect, it } from "vitest";

import { postBodyExtensions } from "./editor-extensions";
import { insertBlockNode } from "./insert-block";

const schema = getSchema(postBodyExtensions);

const imageAttrs = {
  mediaId: "00000000-0000-4000-8000-000000000001",
  width: 640,
  height: 360,
  alt: "Birinci görsel",
  caption: null,
  decorative: null,
};

const secondImageAttrs = {
  ...imageAttrs,
  mediaId: "00000000-0000-4000-8000-000000000002",
  alt: "İkinci görsel",
};

const videoAttrs = { videoId: "dQw4w9WgXcQ", title: "Örnek", start: null };

function stateWith(content: unknown[]) {
  return EditorState.create({
    schema,
    doc: schema.nodeFromJSON({ type: "doc", content }),
  });
}

function blockTypes(state: EditorState) {
  const types: string[] = [];
  state.doc.forEach((node) => {
    types.push(node.type.name === "image" ? `image:${node.attrs.alt}` : node.type.name);
  });
  return types;
}

function selectedNodeAt(state: EditorState, position: number) {
  return NodeSelection.create(state.doc, position);
}

describe("insertBlockNode", () => {
  const paragraph = { type: "paragraph", content: [{ type: "text", text: "Giriş" }] };
  // The paragraph spans positions 0..7, so the image starts at 7.
  const imagePosition = 7;

  it("keeps a selected image and inserts a video after it", () => {
    let state = stateWith([paragraph, { type: "image", attrs: imageAttrs }]);
    state = state.apply(state.tr.setSelection(selectedNodeAt(state, imagePosition)));

    const video = schema.nodes.youtube.create(videoAttrs);
    const next = state.apply(insertBlockNode(state.tr, video));

    expect(blockTypes(next)).toEqual(["paragraph", "image:Birinci görsel", "youtube"]);
    expect(next.selection).toBeInstanceOf(NodeSelection);
    expect((next.selection as NodeSelection).node.type.name).toBe("youtube");
  });

  it("keeps a selected image and inserts another image after it", () => {
    let state = stateWith([paragraph, { type: "image", attrs: imageAttrs }]);
    state = state.apply(state.tr.setSelection(selectedNodeAt(state, imagePosition)));

    const image = schema.nodes.image.create(secondImageAttrs);
    const next = state.apply(insertBlockNode(state.tr, image));

    expect(blockTypes(next)).toEqual([
      "paragraph",
      "image:Birinci görsel",
      "image:İkinci görsel",
    ]);
  });

  it("supports consecutive inserts without losing earlier blocks", () => {
    let state = stateWith([paragraph]);
    state = state.apply(state.tr.setSelection(TextSelection.create(state.doc, 6)));

    for (const node of [
      schema.nodes.image.create(imageAttrs),
      schema.nodes.youtube.create(videoAttrs),
      schema.nodes.image.create(secondImageAttrs),
    ]) {
      state = state.apply(insertBlockNode(state.tr, node));
    }

    expect(blockTypes(state)).toEqual([
      "paragraph",
      "image:Birinci görsel",
      "youtube",
      "image:İkinci görsel",
    ]);
  });

  it("inserts at a text cursor without removing the paragraph text", () => {
    let state = stateWith([paragraph]);
    state = state.apply(state.tr.setSelection(TextSelection.create(state.doc, 6)));

    const next = state.apply(
      insertBlockNode(state.tr, schema.nodes.youtube.create(videoAttrs)),
    );

    expect(next.doc.textContent).toBe("Giriş");
    expect(blockTypes(next)).toContain("youtube");
  });
});
