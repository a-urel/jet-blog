import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

// Phase 11: reader-facing Server Actions take identity only from the verified
// session. This guards against a later change that starts reading a user id,
// role, or email for authorization from the submitted form.
const actionFiles = {
  "features/auth/actions.ts": [
    "email",
    "password",
    "confirmPassword",
    "displayName",
    // Sign-in return path; validated by safeReturnPath, never an identity.
    "next",
  ],
  "features/account/actions.ts": ["displayName", "password", "confirmDelete"],
} as const;

function formFields(source: string) {
  return [...source.matchAll(/formData\.get\(\s*"([^"]+)"\s*\)/g)].map(
    (match) => match[1],
  );
}

describe("reader Server Action inputs", () => {
  for (const [file, allowed] of Object.entries(actionFiles)) {
    it(`${file} reads only allowlisted form fields`, () => {
      const source = readFileSync(
        fileURLToPath(new URL(`../../${file}`, import.meta.url)),
        "utf8",
      );
      const fields = formFields(source);

      expect(fields.length).toBeGreaterThan(0);
      expect(fields.filter((field) => !(allowed as readonly string[]).includes(field))).toEqual([]);
      expect(source).not.toMatch(/user_metadata|app_metadata/);
    });
  }

  it("account deletion uses the session user id for the admin call", () => {
    const source = readFileSync(
      fileURLToPath(new URL("./actions.ts", import.meta.url)),
      "utf8",
    );

    expect(source).toMatch(/admin\.auth\.admin\.deleteUser\(user\.id\)/);
    expect(source).toMatch(/const user = await getSessionUser\(\)/);
  });

  // Phase 12: the bookmark action takes only a post id and the wanted state;
  // the owner is the session user and RLS pins user_id to auth.uid().
  it("bookmark writes never take a user id from the client", () => {
    const source = readFileSync(
      fileURLToPath(new URL("../bookmarks/actions.ts", import.meta.url)),
      "utf8",
    );

    expect(source).toMatch(/\.insert\(\{ post_id: postId \}\)/);
    expect(source).toMatch(/\.eq\("user_id", user\.id\)/);
    expect(source).toMatch(/const user = await getSessionUser\(\)/);
  });
});
