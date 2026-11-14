import { describe, expect, it } from "vitest";

import { testImages } from "./test-images";
import {
  maxMediaBytes,
  maxMediaFileNameLength,
  normalizeMediaFileName,
  readImageInfo,
  validateMediaUpload,
} from "./validation";

describe("readImageInfo", () => {
  it.each([
    ["png", testImages.png, "image/png", 3, 2],
    ["jpeg", testImages.jpeg, "image/jpeg", 3, 2],
    ["progressive jpeg", testImages.progressiveJpeg, "image/jpeg", 3, 2],
    ["gif", testImages.gif, "image/gif", 3, 2],
    ["lossy webp", testImages.webp, "image/webp", 3, 2],
    ["lossless webp", testImages.losslessWebp, "image/webp", 3, 2],
    ["extended webp", testImages.extendedWebp, "image/webp", 5, 4],
  ] as const)("reads %s", (_name, bytes, mimeType, width, height) => {
    expect(readImageInfo(bytes)).toEqual({ mimeType, width, height });
  });

  it.each([
    ["svg", testImages.svg],
    ["html", testImages.html],
    ["truncated png", testImages.png.subarray(0, 20)],
    ["truncated jpeg", testImages.jpeg.subarray(0, 40)],
    ["empty", new Uint8Array()],
  ])("rejects %s", (_name, bytes) => {
    expect(readImageInfo(bytes)).toBeNull();
  });
});

describe("validateMediaUpload", () => {
  it("accepts a supported image", () => {
    expect(validateMediaUpload(testImages.webp)).toEqual({
      ok: true,
      info: { mimeType: "image/webp", width: 3, height: 2 },
    });
  });

  it("rejects an empty file", () => {
    expect(validateMediaUpload(new Uint8Array())).toEqual({ ok: false, reason: "empty" });
  });

  it("rejects a file above the size limit before parsing it", () => {
    const bytes = new Uint8Array(maxMediaBytes + 1);
    bytes.set(testImages.png);

    expect(validateMediaUpload(bytes)).toEqual({ ok: false, reason: "too-large" });
  });

  it("rejects SVG even when it is small", () => {
    expect(validateMediaUpload(testImages.svg)).toEqual({
      ok: false,
      reason: "unsupported-type",
    });
  });

  it("rejects images beyond the dimension limit", () => {
    const bytes = testImages.png.slice();
    // IHDR width = 10001
    new DataView(bytes.buffer).setUint32(16, 10_001);

    expect(validateMediaUpload(bytes)).toEqual({
      ok: false,
      reason: "invalid-dimensions",
    });
  });
});

describe("normalizeMediaFileName", () => {
  it.each([
    ["keeps a plain name", "photo.jpg", "photo.jpg"],
    ["drops a path", "C:\\Users\\me\\Desktop\\photo.jpg", "photo.jpg"],
    ["drops a POSIX path", "/tmp/uploads/photo.jpg", "photo.jpg"],
    ["trims and collapses whitespace", "  my   photo .jpg  ", "my photo .jpg"],
    ["removes control and format characters", "pho\u0000to\u200b.png", "photo.png"],
    ["composes to NFC", "Se\u0300te.jpg", "S\u00e8te.jpg"],
  ])("%s", (_case, input, expected) => {
    expect(normalizeMediaFileName(input)).toBe(expected);
  });

  it.each(["", "   ", "\u0000", "folder/"])("returns null for %j", (input) => {
    expect(normalizeMediaFileName(input)).toBeNull();
  });

  it("shortens long names and keeps a short extension", () => {
    const result = normalizeMediaFileName(`${"ğ".repeat(300)}.jpeg`);

    expect(result).not.toBeNull();
    expect(Array.from(result as string)).toHaveLength(maxMediaFileNameLength);
    expect(result?.endsWith(".jpeg")).toBe(true);
  });
});
