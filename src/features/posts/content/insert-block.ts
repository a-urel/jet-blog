import { NodeSelection, type Transaction } from "@tiptap/pm/state";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";

// Inserts a block atom (image, YouTube video) from a toolbar panel. After an
// insert the new node stays selected, and replacing a node selection would
// silently delete the image or video the author just added. A selected node is
// therefore kept and the new block goes directly after it; any other selection
// is replaced as usual. The inserted node becomes the new selection.
export function insertBlockNode(tr: Transaction, node: ProseMirrorNode): Transaction {
  if (tr.selection instanceof NodeSelection) {
    const position = tr.selection.to;
    tr.insert(position, node);
    return tr.setSelection(NodeSelection.create(tr.doc, position));
  }

  return tr.replaceSelectionWith(node);
}
