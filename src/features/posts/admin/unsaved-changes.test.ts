import { describe, expect, it } from "vitest";

import {
  historyNavigationLeavesPage,
  linkClickLeavesPage,
  type LinkClick,
} from "./unsaved-changes";

const current = "http://localhost:3000/admin/posts/abc?status=updated";

function click(overrides: Partial<LinkClick> = {}): LinkClick {
  return {
    href: "http://localhost:3000/admin/posts",
    target: "",
    download: false,
    button: 0,
    modified: false,
    ...overrides,
  };
}

describe("linkClickLeavesPage", () => {
  it("asks before following an in-app link", () => {
    expect(linkClickLeavesPage(click(), current)).toBe(true);
  });

  it("asks before reloading the same page through a link", () => {
    expect(
      linkClickLeavesPage(click({ href: "http://localhost:3000/admin/posts/abc" }), current),
    ).toBe(true);
  });

  it("ignores in-page fragments", () => {
    expect(
      linkClickLeavesPage(
        click({ href: "http://localhost:3000/admin/posts/abc?status=updated#post-body" }),
        current,
      ),
    ).toBe(false);
  });

  it.each([
    ["new tab target", { target: "_blank" }],
    ["download", { download: true }],
    ["middle click", { button: 1 }],
    ["modified click", { modified: true }],
    ["other origin", { href: "https://example.com/" }],
  ])("ignores %s", (_name, overrides) => {
    expect(linkClickLeavesPage(click(overrides), current)).toBe(false);
  });

  it("ignores malformed URLs", () => {
    expect(linkClickLeavesPage(click({ href: "http://[" }), current)).toBe(false);
  });
});

describe("historyNavigationLeavesPage", () => {
  it("asks before a cancelable Back/Forward traversal to another page", () => {
    expect(
      historyNavigationLeavesPage({ navigationType: "traverse", cancelable: true, hashChange: false }),
    ).toBe(true);
  });

  it.each([
    ["push (guarded on click)", { navigationType: "push" as const }],
    ["replace (status cleanup, save redirect)", { navigationType: "replace" as const }],
    ["reload (beforeunload)", { navigationType: "reload" as const }],
    ["uncancelable traversal", { cancelable: false }],
    ["fragment-only traversal", { hashChange: true }],
  ])("ignores %s", (_name, overrides) => {
    expect(
      historyNavigationLeavesPage({
        navigationType: "traverse",
        cancelable: true,
        hashChange: false,
        ...overrides,
      }),
    ).toBe(false);
  });
});
