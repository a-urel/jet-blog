import { describe, expect, it } from "vitest";

import trAuth from "@/messages/tr/auth.json";
import { checkPasswordPolicy, passwordPolicyValues } from "./password-policy";

describe("checkPasswordPolicy", () => {
  it("accepts letters and digits of the minimum length", () => {
    expect(checkPasswordPolicy("abcdefg1")).toBeNull();
    expect(checkPasswordPolicy("Correct-Horse-1")).toBeNull();
    expect(checkPasswordPolicy("şifre123")).toBeNull();
  });

  it("rejects short passwords", () => {
    expect(checkPasswordPolicy("abc1")).toBe("tooShort");
    expect(checkPasswordPolicy("")).toBe("tooShort");
  });

  it("requires a letter and a digit", () => {
    expect(checkPasswordPolicy("abcdefgh")).toBe("lettersDigits");
    expect(checkPasswordPolicy("12345678")).toBe("lettersDigits");
    expect(checkPasswordPolicy("!!!!!!!!")).toBe("lettersDigits");
  });

  it("rejects passwords longer than 72 bytes", () => {
    expect(checkPasswordPolicy(`a1${"x".repeat(70)}`)).toBeNull();
    expect(checkPasswordPolicy(`a1${"x".repeat(71)}`)).toBe("tooLong");
    // Multi-byte characters count by their UTF-8 length.
    expect(checkPasswordPolicy(`1${"ş".repeat(36)}`)).toBe("tooLong");
  });

  it("returns keys that exist in the source catalog", () => {
    for (const key of ["tooShort", "tooLong", "lettersDigits"] as const) {
      expect(trAuth.passwordPolicy[key]).toBeTruthy();
    }
    expect(passwordPolicyValues).toEqual({ min: 8, max: 72 });
  });
});
