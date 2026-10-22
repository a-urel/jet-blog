// Shared allowlist for stored post bodies. The Tiptap editor, the read-only
// renderer, the Server Action boundary, and the database function
// `post_body_error` all apply these rules. Change them together: the database
// mirror lives in supabase/migrations/20261022180000_post_body.sql, and the
// shared fixtures in ./fixtures.ts run against both.

export const currentContentVersion = 1;

// The serialized document must stay below this size. It bounds request bodies
// and keeps a single post from growing without limit.
export const maxBodyLength = 200_000;
export const maxBodyDepth = 24;
export const maxHrefLength = 2048;

export const headingLevels = [2, 3, 4] as const;

export const blockNodeTypes = [
  "paragraph",
  "heading",
  "bulletList",
  "orderedList",
  "blockquote",
  "codeBlock",
  "horizontalRule",
] as const;

export const inlineNodeTypes = ["text", "hardBreak"] as const;

export const nodeTypes = [
  "doc",
  ...blockNodeTypes,
  "listItem",
  ...inlineNodeTypes,
] as const;

export const markTypes = ["bold", "italic", "strike", "code", "link"] as const;

export type BlockNodeType = (typeof blockNodeTypes)[number];
export type NodeType = (typeof nodeTypes)[number];
export type MarkType = (typeof markTypes)[number];
export type HeadingLevel = (typeof headingLevels)[number];

export type BodyMark =
  | { type: "bold" | "italic" | "strike" | "code" }
  | { type: "link"; attrs: { href: string } };

export type TextNode = { type: "text"; text: string; marks?: BodyMark[] };
export type HardBreakNode = { type: "hardBreak" };
export type InlineNode = TextNode | HardBreakNode;

export type ParagraphNode = { type: "paragraph"; content?: InlineNode[] };
export type HeadingNode = {
  type: "heading";
  attrs: { level: HeadingLevel };
  content?: InlineNode[];
};
export type BlockquoteNode = { type: "blockquote"; content: BlockNode[] };
export type ListItemNode = { type: "listItem"; content: BlockNode[] };
export type BulletListNode = { type: "bulletList"; content: ListItemNode[] };
export type OrderedListNode = {
  type: "orderedList";
  attrs?: { start: number };
  content: ListItemNode[];
};
export type CodeBlockNode = {
  type: "codeBlock";
  attrs?: { language: string };
  content?: TextNode[];
};
export type HorizontalRuleNode = { type: "horizontalRule" };

export type BlockNode =
  | ParagraphNode
  | HeadingNode
  | BlockquoteNode
  | BulletListNode
  | OrderedListNode
  | CodeBlockNode
  | HorizontalRuleNode;

export type BodyDocument = { type: "doc"; content: BlockNode[] };

export const emptyBodyDocument: BodyDocument = {
  type: "doc",
  content: [{ type: "paragraph" }],
};

export type BodyValidation =
  | { ok: true; doc: BodyDocument }
  | { ok: false; error: string };

// Absolute http(s) and mailto links, site-relative paths, and in-page
// fragments. Protocol-relative ("//host") and backslash paths are rejected
// because browsers resolve them to another origin. The SQL mirror uses the same
// pattern with a case-insensitive match.
const hrefPattern =
  /^(?:https?:\/\/[^\s"<>\\]+|mailto:[^\s"<>\\]+|\/(?:[^/\s"<>\\][^\s"<>\\]*)?|#[^\s"<>\\]*)$/i;
const controlCharacterPattern = /[\u0000-\u001f\u007f]/;
const languagePattern = /^[a-z0-9+#-]{1,32}$/;

export function isSafeHref(value: string): boolean {
  return (
    value.length > 0 &&
    value.length <= maxHrefLength &&
    !controlCharacterPattern.test(value) &&
    hrefPattern.test(value)
  );
}

type JsonObject = Record<string, unknown>;

function isObject(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasOnlyKeys(value: JsonObject, allowed: readonly string[]): boolean {
  return Object.keys(value).every((key) => allowed.includes(key));
}

class BodyError extends Error {}

function fail(message: string): never {
  throw new BodyError(message);
}

const blockTypeSet = new Set<string>(blockNodeTypes);
const inlineTypeSet = new Set<string>(inlineNodeTypes);
const nodeTypeSet = new Set<string>(nodeTypes);
const markTypeSet = new Set<string>(markTypes);

type ContentRule = "block+" | "inline*" | "text*" | "listItem+" | "listItem" | "none";

const contentRules: Record<NodeType, ContentRule> = {
  doc: "block+",
  paragraph: "inline*",
  heading: "inline*",
  blockquote: "block+",
  bulletList: "listItem+",
  orderedList: "listItem+",
  listItem: "listItem",
  codeBlock: "text*",
  horizontalRule: "none",
  hardBreak: "none",
  text: "none",
};

function validateMarks(value: unknown, inCodeBlock: boolean): void {
  if (!Array.isArray(value) || value.length === 0) {
    fail("Marks must be a non-empty array");
  }

  if (inCodeBlock) fail("Code block text cannot have marks");

  const seen = new Set<string>();

  for (const mark of value) {
    if (!isObject(mark) || typeof mark.type !== "string") {
      fail("Invalid mark");
    }

    if (!markTypeSet.has(mark.type)) fail(`Unsupported mark: ${mark.type}`);
    if (seen.has(mark.type)) fail(`Duplicate mark: ${mark.type}`);
    seen.add(mark.type);

    if (mark.type === "link") {
      if (!hasOnlyKeys(mark, ["type", "attrs"]) || !isObject(mark.attrs)) {
        fail("Invalid link mark");
      }

      if (!hasOnlyKeys(mark.attrs, ["href"])) fail("Invalid link attributes");

      const href = mark.attrs.href;
      if (typeof href !== "string" || !isSafeHref(href)) {
        fail("Unsafe link href");
      }
    } else if (!hasOnlyKeys(mark, ["type"])) {
      fail(`Mark ${mark.type} does not accept attributes`);
    }
  }
}

function validateAttrs(node: JsonObject, type: NodeType): void {
  const attrs = node.attrs;

  switch (type) {
    case "heading":
      if (
        !isObject(attrs) ||
        !hasOnlyKeys(attrs, ["level"]) ||
        !headingLevels.includes(attrs.level as HeadingLevel)
      ) {
        fail("Invalid heading level");
      }
      return;
    case "orderedList":
      if (attrs === undefined) return;
      if (
        !isObject(attrs) ||
        !hasOnlyKeys(attrs, ["start"]) ||
        !Number.isInteger(attrs.start) ||
        (attrs.start as number) < 1 ||
        (attrs.start as number) > 9999
      ) {
        fail("Invalid ordered list start");
      }
      return;
    case "codeBlock":
      if (attrs === undefined) return;
      if (
        !isObject(attrs) ||
        !hasOnlyKeys(attrs, ["language"]) ||
        typeof attrs.language !== "string" ||
        !languagePattern.test(attrs.language)
      ) {
        fail("Invalid code block language");
      }
      return;
    default:
      if (attrs !== undefined) fail(`Node ${type} does not accept attributes`);
  }
}

function validateChildren(
  children: unknown[],
  rule: ContentRule,
  parentType: NodeType,
  depth: number,
): void {
  if ((rule === "block+" || rule === "listItem+" || rule === "listItem") && children.length === 0) {
    fail(`${parentType} must not be empty`);
  }

  children.forEach((child, index) => {
    if (!isObject(child) || typeof child.type !== "string") fail("Invalid node");

    const childType = child.type;
    let allowed: boolean;

    switch (rule) {
      case "block+":
        allowed = blockTypeSet.has(childType);
        break;
      case "inline*":
        allowed = inlineTypeSet.has(childType);
        break;
      case "text*":
        allowed = childType === "text";
        break;
      case "listItem+":
        allowed = childType === "listItem";
        break;
      case "listItem":
        // Matches Tiptap's "paragraph block*": the first child is a paragraph.
        allowed = index === 0 ? childType === "paragraph" : blockTypeSet.has(childType);
        break;
      default:
        allowed = false;
    }

    if (!allowed) fail(`${childType} is not allowed inside ${parentType}`);

    validateNode(child, depth + 1, parentType === "codeBlock");
  });
}

function validateNode(node: JsonObject, depth: number, inCodeBlock: boolean): void {
  if (depth > maxBodyDepth) fail("Document is nested too deeply");

  const type = node.type;
  if (typeof type !== "string" || !nodeTypeSet.has(type)) {
    fail(`Unsupported node: ${String(type)}`);
  }

  const nodeType = type as NodeType;

  if (nodeType === "text") {
    if (!hasOnlyKeys(node, ["type", "text", "marks"])) fail("Invalid text node");
    if (typeof node.text !== "string" || node.text.length === 0) {
      fail("Text nodes must not be empty");
    }
    if (node.marks !== undefined) validateMarks(node.marks, inCodeBlock);
    return;
  }

  if (!hasOnlyKeys(node, ["type", "attrs", "content"])) {
    fail(`Invalid keys on ${nodeType}`);
  }

  validateAttrs(node, nodeType);

  const rule = contentRules[nodeType];

  if (rule === "none") {
    if (node.content !== undefined) fail(`${nodeType} cannot have content`);
    return;
  }

  if (node.content === undefined) {
    if (rule === "inline*" || rule === "text*") return;
    fail(`${nodeType} must not be empty`);
  }

  if (!Array.isArray(node.content)) fail(`Invalid content on ${nodeType}`);

  validateChildren(node.content, rule, nodeType, depth);
}

// Strict validation of a stored, canonical document. Unknown nodes, marks, or
// attribute keys are rejected rather than dropped.
export function validateBodyDocument(value: unknown): BodyValidation {
  try {
    if (!isObject(value) || value.type !== "doc") fail("Root must be a doc node");
    if (JSON.stringify(value).length > maxBodyLength) fail("Document is too large");

    validateNode(value, 0, false);

    return { ok: true, doc: value as BodyDocument };
  } catch (error) {
    if (error instanceof BodyError) return { ok: false, error: error.message };
    throw error;
  }
}

// Convert Tiptap's `getJSON()` output to the canonical stored form. Only
// attributes the editor fills with known defaults are removed; anything
// unexpected is kept so strict validation can reject it.
export function normalizeEditorDocument(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(normalizeEditorDocument);
  if (!isObject(value)) return value;

  const node: JsonObject = { ...value };

  if (Array.isArray(node.content)) {
    node.content = node.content.map(normalizeEditorDocument);
  }

  if (Array.isArray(node.marks)) {
    node.marks = node.marks.map((mark) => {
      if (!isObject(mark) || mark.type !== "link" || !isObject(mark.attrs)) {
        return mark;
      }

      // The renderer decides rel and target, so the editor's values are not
      // stored. Empty class/title defaults are dropped; set values are kept.
      const attrs: JsonObject = { ...mark.attrs };
      delete attrs.target;
      delete attrs.rel;
      if (attrs.class === null) delete attrs.class;
      if (attrs.title === null) delete attrs.title;

      return { ...mark, attrs };
    });
  }

  if (isObject(node.attrs)) {
    const attrs: JsonObject = { ...node.attrs };

    if (node.type === "orderedList") {
      if (attrs.type === null) delete attrs.type;
      if (attrs.start === 1) delete attrs.start;
    }

    if (node.type === "codeBlock" && attrs.language === null) {
      delete attrs.language;
    }

    if (Object.keys(attrs).length === 0) delete node.attrs;
    else node.attrs = attrs;
  }

  return node;
}

export type ParsedBody =
  | { ok: true; doc: BodyDocument }
  | { ok: false; error: string };

// Parse the serialized editor payload submitted by the post form.
export function parseSubmittedBody(raw: string): ParsedBody {
  if (raw.length === 0) return { ok: true, doc: emptyBodyDocument };
  if (raw.length > maxBodyLength * 2) {
    return { ok: false, error: "Document is too large" };
  }

  let parsed: unknown;

  try {
    parsed = JSON.parse(raw);
  } catch {
    return { ok: false, error: "Malformed JSON" };
  }

  return validateBodyDocument(normalizeEditorDocument(parsed));
}
