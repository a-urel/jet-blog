import StarterKit from "@tiptap/starter-kit";

import { headingLevels, isSafeHref } from "./schema";

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
];
