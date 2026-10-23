import { describe, expect, it } from "vitest";

import { checkPasswordPolicy } from "./password-policy";

describe("checkPasswordPolicy", () => {
  it("accepts letters and digits of the minimum length", () => {
    expect(checkPasswordPolicy("abcdefg1")).toBeNull();
    expect(checkPasswordPolicy("Correct-Horse-1")).toBeNull();
    expect(checkPasswordPolicy("şifre123")).toBeNull();
  });

  it("rejects short passwords", () => {
    expect(checkPasswordPolicy("abc1")).toBe("too-short");
    expect(checkPasswordPolicy("")).toBe("too-short");
  });

  it("requires a letter and a digit", () => {
    expect(checkPasswordPolicy("abcdefgh")).toBe("letters-digits");
    expect(checkPasswordPolicy("12345678")).toBe("letters-digits");
    expect(checkPasswordPolicy("!!!!!!!!")).toBe("letters-digits");
  });

  it("rejects passwords longer than 72 bytes", () => {
    expect(checkPasswordPolicy(`a1${"x".repeat(70)}`)).toBeNull();
    expect(checkPasswordPolicy(`a1${"x".repeat(71)}`)).toBe("too-long");
    // Multi-byte characters count by their UTF-8 length.
    expect(checkPasswordPolicy(`1${"ş".repeat(36)}`)).toBe("too-long");
  });
});
