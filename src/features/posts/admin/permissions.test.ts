import { describe, expect, it } from "vitest";

import type { EditorialMembership } from "@/lib/auth/editorial";
import { canEditPost } from "./permissions";

const authorA = "11111111-1111-4111-8111-111111111111";
const authorB = "22222222-2222-4222-8222-222222222222";

const admin: EditorialMembership = { role: "admin" };
const editor: EditorialMembership = { role: "editor" };
const author: EditorialMembership = { role: "author" };

describe("canEditPost", () => {
  it("lets editors and admins edit drafts and published posts", () => {
    expect(
      canEditPost({ status: "draft", createdBy: authorB }, editor, authorA),
    ).toBe(true);
    expect(
      canEditPost(
        { status: "published", createdBy: authorB },
        admin,
        authorA,
      ),
    ).toBe(true);
  });

  it("lets an author edit only their own draft", () => {
    expect(
      canEditPost({ status: "draft", createdBy: authorA }, author, authorA),
    ).toBe(true);
    expect(
      canEditPost({ status: "draft", createdBy: authorB }, author, authorA),
    ).toBe(false);
    expect(
      canEditPost({ status: "published", createdBy: authorA }, author, authorA),
    ).toBe(false);
  });

  it("denies non-members", () => {
    expect(
      canEditPost({ status: "draft", createdBy: authorA }, null, authorA),
    ).toBe(false);
  });
});
