import { describe, expect, it } from "vitest";

import { validateDisplayName } from "./validation";

describe("validateDisplayName", () => {
  it("trims and collapses whitespace", () => {
    expect(validateDisplayName("  Ayşe   Yılmaz ")).toEqual({
      ok: true,
      value: "Ayşe Yılmaz",
    });
  });

  it("rejects empty and whitespace-only names", () => {
    expect(validateDisplayName("")).toEqual({ ok: false, error: "required" });
    expect(validateDisplayName("   ")).toEqual({ ok: false, error: "required" });
  });

  it("rejects names longer than 120 characters", () => {
    expect(validateDisplayName("a".repeat(120)).ok).toBe(true);
    expect(validateDisplayName("a".repeat(121))).toEqual({ ok: false, error: "tooLong" });
  });
});
