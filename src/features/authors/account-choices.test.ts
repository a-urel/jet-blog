import { describe, expect, it } from "vitest";

import { authorAccountChoices } from "./account-choices";

const options = [
  { profileId: "p-active", label: "Aktif", deactivated: false },
  { profileId: "p-linked", label: "Bağlı", deactivated: false },
  { profileId: "p-retired", label: "Emekli", deactivated: true },
];

const links = [
  { authorId: "a-other", profileId: "p-linked" },
  { authorId: "a-retired", profileId: "p-retired" },
  { authorId: "a-guest", profileId: null },
];

describe("authorAccountChoices", () => {
  it("offers unlinked active members for a new author", () => {
    expect(authorAccountChoices(options, links)).toEqual([
      { profileId: "p-active", label: "Aktif", deactivated: false },
    ]);
  });

  it("keeps the current link, even for a deactivated member", () => {
    expect(authorAccountChoices(options, links, "a-retired")).toEqual([
      { profileId: "p-active", label: "Aktif", deactivated: false },
      { profileId: "p-retired", label: "Emekli", deactivated: true },
    ]);
    expect(authorAccountChoices(options, links, "a-other")).toEqual([
      { profileId: "p-active", label: "Aktif", deactivated: false },
      { profileId: "p-linked", label: "Bağlı", deactivated: false },
    ]);
  });
});
