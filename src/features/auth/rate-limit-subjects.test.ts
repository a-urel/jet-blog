import { describe, expect, it } from "vitest";

import {
  authRateLimitSubjects,
  clientIpFromHeaders,
  normalizeEmail,
} from "./rate-limit-subjects";

describe("authRateLimitSubjects", () => {
  it("hashes subjects to 64 hex characters without the raw value", () => {
    const subjects = authRateLimitSubjects("Reader@Example.test", "203.0.113.7");

    expect(subjects.emailHash).toMatch(/^[0-9a-f]{64}$/);
    expect(subjects.ipHash).toMatch(/^[0-9a-f]{64}$/);
    expect(subjects.emailHash).not.toContain("reader");
  });

  it("normalizes email case and whitespace", () => {
    expect(authRateLimitSubjects(" READER@example.test ", null).emailHash).toBe(
      authRateLimitSubjects("reader@example.test", null).emailHash,
    );
    expect(normalizeEmail(" A@B.test ")).toBe("a@b.test");
  });

  it("separates email and IP subjects with the same text", () => {
    const subjects = authRateLimitSubjects("x", "x");
    expect(subjects.emailHash).not.toBe(subjects.ipHash);
  });

  it("omits missing subjects", () => {
    expect(authRateLimitSubjects(null, null)).toEqual({
      emailHash: null,
      ipHash: null,
    });
    expect(authRateLimitSubjects("   ", null).emailHash).toBeNull();
  });
});

describe("clientIpFromHeaders", () => {
  it("uses the first X-Forwarded-For entry", () => {
    const headers = new Headers({
      "x-forwarded-for": "203.0.113.7, 10.0.0.1",
      "x-real-ip": "10.0.0.2",
    });
    expect(clientIpFromHeaders(headers)).toBe("203.0.113.7");
  });

  it("falls back to X-Real-IP and then null", () => {
    expect(clientIpFromHeaders(new Headers({ "x-real-ip": "10.0.0.2" }))).toBe(
      "10.0.0.2",
    );
    expect(clientIpFromHeaders(new Headers())).toBeNull();
  });
});
