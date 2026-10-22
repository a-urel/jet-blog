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
});
