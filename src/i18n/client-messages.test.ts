import { describe, expect, it } from "vitest";

import { catalogs } from "./catalogs";
import {
  accountClientMessages,
  adminClientMessages,
  pickMessages,
  publicClientMessages,
} from "./client-messages";

describe("pickMessages", () => {
  it("copies only the listed subtrees", () => {
    const picked = pickMessages(catalogs.en, ["common.dialog", "auth.signIn.submit"]);
    expect(picked).toEqual({
      common: { dialog: catalogs.en.common.dialog },
      auth: { signIn: { submit: catalogs.en.auth.signIn.submit } },
    });
  });

  it("merges sibling paths", () => {
    const picked = pickMessages(catalogs.tr, ["auth.fields", "auth.signIn.pending"]) as {
      auth: Record<string, unknown>;
    };
    expect(Object.keys(picked.auth).sort()).toEqual(["fields", "signIn"]);
  });

  it("rejects an unknown path", () => {
    expect(() => pickMessages(catalogs.tr, ["common.nope"])).toThrow(/common\.nope/);
  });

  it("resolves every configured path in every locale", () => {
    for (const messages of Object.values(catalogs)) {
      for (const paths of [publicClientMessages, accountClientMessages, adminClientMessages]) {
        expect(() => pickMessages(messages, paths)).not.toThrow();
      }
    }
  });

  it("keeps sign-in, search, and admin copy off public pages", () => {
    const roots = publicClientMessages.map((path) => path.split(".")[0]);
    for (const namespace of ["auth", "search", "posts", "admin", "adminPosts"]) {
      expect(roots).not.toContain(namespace);
    }
  });
});
