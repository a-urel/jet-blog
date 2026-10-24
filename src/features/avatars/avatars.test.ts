import { afterEach, describe, expect, it, vi } from "vitest";

import { testImages } from "@/features/media/test-images";
import { avatarObjectName, avatarPublicPath, avatarPublicUrl } from "./url";
import trAvatars from "@/messages/tr/avatars.json";
import {
  avatarInitials,
  avatarLimitValues,
  maxAvatarBytes,
  maxAvatarDimension,
  minAvatarDimension,
  validateAvatarUpload,
} from "./validation";

// The signature readers only look at the header, so a copy of the 3x2 PNG with
// rewritten IHDR dimensions stands in for a larger image.
function pngWithSize(width: number, height: number): Uint8Array {
  const bytes = new Uint8Array(testImages.png);
  const view = new DataView(bytes.buffer);
  view.setUint32(16, width);
  view.setUint32(20, height);
  return bytes;
}

describe("validateAvatarUpload", () => {
  it("accepts PNG, JPEG, and WebP by signature", () => {
    expect(validateAvatarUpload(pngWithSize(256, 256))).toEqual({
      ok: true,
      info: { mimeType: "image/png", width: 256, height: 256 },
    });

    // The fixtures are 3x2, so these only pass the type check.
    for (const bytes of [testImages.jpeg, testImages.webp, testImages.losslessWebp]) {
      expect(validateAvatarUpload(bytes)).toEqual({ ok: false, reason: "invalidDimensions" });
    }
  });

  it.each([
    ["GIF", testImages.gif],
    ["SVG", testImages.svg],
    ["HTML", testImages.html],
  ])("rejects %s", (_name, bytes) => {
    expect(validateAvatarUpload(bytes)).toEqual({ ok: false, reason: "unsupportedType" });
  });

  it("rejects empty and oversized files", () => {
    expect(validateAvatarUpload(new Uint8Array())).toEqual({ ok: false, reason: "empty" });

    const oversized = new Uint8Array(maxAvatarBytes + 1);
    oversized.set(pngWithSize(256, 256));
    expect(validateAvatarUpload(oversized)).toEqual({ ok: false, reason: "tooLarge" });
  });

  it("bounds the edge length", () => {
    expect(validateAvatarUpload(pngWithSize(minAvatarDimension, minAvatarDimension)).ok).toBe(true);
    expect(validateAvatarUpload(pngWithSize(maxAvatarDimension, 400)).ok).toBe(true);
    expect(validateAvatarUpload(pngWithSize(minAvatarDimension - 1, 400))).toEqual({
      ok: false,
      reason: "invalidDimensions",
    });
    expect(validateAvatarUpload(pngWithSize(400, maxAvatarDimension + 1))).toEqual({
      ok: false,
      reason: "invalidDimensions",
    });
  });
});

describe("avatar rejection keys", () => {
  it("exist in the source catalog with their limits", () => {
    for (const key of ["empty", "tooLarge", "unsupportedType", "invalidDimensions"] as const) {
      expect(trAvatars.rejection[key]).toBeTruthy();
    }
    expect(avatarLimitValues).toEqual({ maxMegabytes: 2, min: 16, max: 4096 });
  });
});

describe("avatarInitials", () => {
  it.each([
    ["Ayşe Yılmaz", "AY"],
    ["ilker", "İ"],
    ["  çağrı   can  öz ", "ÇÖ"],
    ["Silinmiş kullanıcı", "SK"],
    ["", "?"],
  ])("%j -> %s", (name, initials) => {
    expect(avatarInitials(name)).toBe(initials);
  });
});

describe("avatar URLs", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("names objects by kind and a UUID only", () => {
    const id = "55555555-5555-4555-8555-555555555555";

    expect(avatarObjectName("profiles", id)).toBe(`profiles/${id}`);
    expect(avatarPublicPath("authors", id)).toBe(`/storage/v1/object/public/avatars/authors/${id}`);
    expect(avatarPublicPath("")).toBe("/storage/v1/object/public/avatars/");
  });

  it("derives the public URL from the Supabase origin", () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://example.supabase.co/");
    expect(avatarPublicUrl("profiles", "id")).toBe(
      "https://example.supabase.co/storage/v1/object/public/avatars/profiles/id",
    );

    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "");
    expect(avatarPublicUrl("profiles", "id")).toBeNull();
  });
});
