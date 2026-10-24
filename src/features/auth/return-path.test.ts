import { describe, expect, it } from "vitest";

import {
  isEditorialPath,
  returnPathForMember,
  safeReturnPath,
  signInPathFor,
} from "./return-path";

describe("safeReturnPath", () => {
  it("accepts same-origin public and reader paths", () => {
    expect(safeReturnPath("/posts/ilk-yazi")).toBe("/posts/ilk-yazi");
    expect(safeReturnPath("/")).toBe("/");
    expect(safeReturnPath("/account/saved")).toBe("/account/saved");
    expect(safeReturnPath("/tags/tasarim?page=2")).toBe("/tags/tasarim?page=2");
  });

  it("drops the fragment", () => {
    expect(safeReturnPath("/posts/ilk-yazi#yorumlar")).toBe("/posts/ilk-yazi");
  });

  it("rejects absolute and protocol-relative URLs", () => {
    expect(safeReturnPath("https://evil.example/posts")).toBeNull();
    expect(safeReturnPath("//evil.example/posts")).toBeNull();
    expect(safeReturnPath("/\\evil.example")).toBeNull();
    expect(safeReturnPath("javascript:alert(1)")).toBeNull();
    expect(safeReturnPath("posts/ilk-yazi")).toBeNull();
  });

  it("rejects control characters and backslashes", () => {
    expect(safeReturnPath("/posts/\nilk")).toBeNull();
    expect(safeReturnPath("/\t/evil.example")).toBeNull();
    expect(safeReturnPath("/posts\\ilk")).toBeNull();
  });

  it("rejects auth and API paths", () => {
    expect(safeReturnPath("/login")).toBeNull();
    expect(safeReturnPath("/login/reset")).toBeNull();
    expect(safeReturnPath("/signup")).toBeNull();
    expect(safeReturnPath("/auth/callback?code=x")).toBeNull();
    expect(safeReturnPath("/api/x")).toBeNull();
    expect(safeReturnPath("/posts/../login")).toBeNull();
  });

  it("accepts normalized admin paths with their query", () => {
    expect(safeReturnPath("/admin")).toBe("/admin");
    expect(safeReturnPath("/admin/comments?filter=hidden&page=2")).toBe(
      "/admin/comments?filter=hidden&page=2",
    );
    expect(safeReturnPath("/posts/../admin")).toBe("/admin");
  });

  it("keeps lookalike prefixes that are separate routes", () => {
    expect(safeReturnPath("/administrators")).toBe("/administrators");
  });

  it("rejects non-strings, empty, and oversized values", () => {
    expect(safeReturnPath(undefined)).toBeNull();
    expect(safeReturnPath(["/posts/a"])).toBeNull();
    expect(safeReturnPath("")).toBeNull();
    expect(safeReturnPath(`/${"a".repeat(600)}`)).toBeNull();
  });
});

describe("returnPathForMember", () => {
  it("keeps admin paths for active members only", () => {
    expect(returnPathForMember("/admin/posts", true)).toBe("/admin/posts");
    expect(returnPathForMember("/admin/posts", false)).toBeNull();
    expect(returnPathForMember("/posts/../admin", false)).toBeNull();
  });

  it("keeps public and reader paths for everyone", () => {
    expect(returnPathForMember("/account/saved", false)).toBe("/account/saved");
    expect(returnPathForMember("/administrators", false)).toBe("/administrators");
    expect(returnPathForMember("/posts/a", true)).toBe("/posts/a");
  });

  it("drops unsafe values", () => {
    expect(returnPathForMember("//evil.example/admin", true)).toBeNull();
    expect(returnPathForMember(undefined, true)).toBeNull();
  });

  it("recognizes editorial paths by segment", () => {
    expect(isEditorialPath("/admin")).toBe(true);
    expect(isEditorialPath("/admin?x=1")).toBe(true);
    expect(isEditorialPath("/admin/posts")).toBe(true);
    expect(isEditorialPath("/administrators")).toBe(false);
  });
});

describe("signInPathFor", () => {
  it("keeps an admin path", () => {
    expect(signInPathFor("/admin/posts?status=all")).toBe(
      "/login?next=%2Fadmin%2Fposts%3Fstatus%3Dall",
    );
  });

  it("encodes the return path", () => {
    expect(signInPathFor("/posts/ilk-yazi")).toBe("/login?next=%2Fposts%2Filk-yazi");
  });

  it("falls back to plain sign-in for unsafe paths", () => {
    expect(signInPathFor("//evil.example")).toBe("/login");
  });
});
