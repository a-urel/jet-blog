import { describe, expect, it } from "vitest";

import type { EditorialMembership } from "@/lib/auth/editorial";
import { canDiscardChanges, canEditPost, canPublishPosts } from "./permissions";

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

  it("lets an author edit only their own posts, including the working copy of a published one", () => {
    expect(
      canEditPost({ status: "draft", createdBy: authorA }, author, authorA),
    ).toBe(true);
    expect(
      canEditPost({ status: "published", createdBy: authorA }, author, authorA),
    ).toBe(true);
    expect(
      canEditPost({ status: "draft", createdBy: authorB }, author, authorA),
    ).toBe(false);
    expect(
      canEditPost({ status: "published", createdBy: authorB }, author, authorA),
    ).toBe(false);
  });

  it("denies non-members", () => {
    expect(
      canEditPost({ status: "draft", createdBy: authorA }, null, authorA),
    ).toBe(false);
  });
});

describe("canDiscardChanges", () => {
  const changed = { status: "published" as const, hasUnpublishedChanges: true };

  it("needs a published post with unpublished changes", () => {
    expect(canDiscardChanges({ ...changed, createdBy: authorB }, editor, authorA)).toBe(true);
    expect(
      canDiscardChanges(
        { ...changed, hasUnpublishedChanges: false, createdBy: authorB },
        editor,
        authorA,
      ),
    ).toBe(false);
    expect(
      canDiscardChanges({ ...changed, status: "draft", createdBy: authorB }, admin, authorA),
    ).toBe(false);
  });

  it("follows the edit rule: an author discards only on their own post", () => {
    expect(canDiscardChanges({ ...changed, createdBy: authorA }, author, authorA)).toBe(true);
    expect(canDiscardChanges({ ...changed, createdBy: authorB }, author, authorA)).toBe(false);
    expect(canDiscardChanges({ ...changed, createdBy: authorA }, null, authorA)).toBe(false);
  });
});

describe("canPublishPosts", () => {
  it("allows editors and admins only", () => {
    expect(canPublishPosts(admin)).toBe(true);
    expect(canPublishPosts(editor)).toBe(true);
    expect(canPublishPosts(author)).toBe(false);
    expect(canPublishPosts(null)).toBe(false);
  });
});
