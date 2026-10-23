import { describe, expect, it } from "vitest";

import { safeReturnPath, signInPathFor } from "./return-path";

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

  it("rejects auth and admin paths", () => {
    expect(safeReturnPath("/login")).toBeNull();
    expect(safeReturnPath("/login/reset")).toBeNull();
    expect(safeReturnPath("/signup")).toBeNull();
    expect(safeReturnPath("/auth/callback?code=x")).toBeNull();
    expect(safeReturnPath("/admin/posts")).toBeNull();
    expect(safeReturnPath("/posts/../admin")).toBeNull();
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

describe("signInPathFor", () => {
  it("encodes the return path", () => {
    expect(signInPathFor("/posts/ilk-yazi")).toBe("/login?next=%2Fposts%2Filk-yazi");
  });

  it("falls back to plain sign-in for unsafe paths", () => {
    expect(signInPathFor("//evil.example")).toBe("/login");
  });
});
