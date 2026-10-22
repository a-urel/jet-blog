// Server-side upload validation. The declared file type and name are ignored:
// the type comes from the file signature and the dimensions from the header.
// SVG, HTML, and every other format are rejected because they are not in the
// signature allowlist. The database repeats the type and size limits in
// `public.register_media`, the media table constraints, and the bucket config.

export const maxMediaBytes = 5 * 1024 * 1024;
export const maxMediaDimension = 10_000;

export const allowedMediaTypes = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
] as const;

export type MediaMimeType = (typeof allowedMediaTypes)[number];

export type ImageInfo = {
  mimeType: MediaMimeType;
  width: number;
  height: number;
};

export type MediaValidation =
  | { ok: true; info: ImageInfo }
  | { ok: false; reason: "empty" | "too-large" | "unsupported-type" | "invalid-dimensions" };

function ascii(bytes: Uint8Array, start: number, length: number): string {
  return String.fromCharCode(...bytes.subarray(start, start + length));
}

function uint16BE(bytes: Uint8Array, offset: number): number {
  return (bytes[offset] << 8) | bytes[offset + 1];
}

function uint16LE(bytes: Uint8Array, offset: number): number {
  return bytes[offset] | (bytes[offset + 1] << 8);
}

function uint24LE(bytes: Uint8Array, offset: number): number {
  return bytes[offset] | (bytes[offset + 1] << 8) | (bytes[offset + 2] << 16);
}

function uint32BE(bytes: Uint8Array, offset: number): number {
  return (
    bytes[offset] * 0x1000000 +
    ((bytes[offset + 1] << 16) | (bytes[offset + 2] << 8) | bytes[offset + 3])
  );
}

function readPng(bytes: Uint8Array): ImageInfo | null {
  const signature = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  if (bytes.length < 24 || !signature.every((byte, index) => bytes[index] === byte)) {
    return null;
  }
  if (ascii(bytes, 12, 4) !== "IHDR") return null;

  return { mimeType: "image/png", width: uint32BE(bytes, 16), height: uint32BE(bytes, 20) };
}

function readGif(bytes: Uint8Array): ImageInfo | null {
  const header = ascii(bytes, 0, 6);
  if (bytes.length < 10 || (header !== "GIF87a" && header !== "GIF89a")) return null;

  return { mimeType: "image/gif", width: uint16LE(bytes, 6), height: uint16LE(bytes, 8) };
}

function readWebp(bytes: Uint8Array): ImageInfo | null {
  if (bytes.length < 30 || ascii(bytes, 0, 4) !== "RIFF" || ascii(bytes, 8, 4) !== "WEBP") {
    return null;
  }

  const chunk = ascii(bytes, 12, 4);

  if (chunk === "VP8 ") {
    // Lossy: keyframe start code, then 14-bit width and height.
    if (bytes[23] !== 0x9d || bytes[24] !== 0x01 || bytes[25] !== 0x2a) return null;
    return {
      mimeType: "image/webp",
      width: uint16LE(bytes, 26) & 0x3fff,
      height: uint16LE(bytes, 28) & 0x3fff,
    };
  }

  if (chunk === "VP8L") {
    // Lossless: signature byte, then 14-bit width-1 and height-1.
    if (bytes[20] !== 0x2f) return null;
    const bits =
      bytes[21] | (bytes[22] << 8) | (bytes[23] << 16) | (bytes[24] << 24);
    return {
      mimeType: "image/webp",
      width: (bits & 0x3fff) + 1,
      height: ((bits >>> 14) & 0x3fff) + 1,
    };
  }

  if (chunk === "VP8X") {
    // Extended: 24-bit canvas width-1 and height-1.
    return {
      mimeType: "image/webp",
      width: uint24LE(bytes, 24) + 1,
      height: uint24LE(bytes, 27) + 1,
    };
  }

  return null;
}

function readJpeg(bytes: Uint8Array): ImageInfo | null {
  if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8 || bytes[2] !== 0xff) {
    return null;
  }

  let offset = 2;

  while (offset + 4 <= bytes.length) {
    if (bytes[offset] !== 0xff) return null;

    const marker = bytes[offset + 1];

    // Fill bytes and standalone markers carry no length.
    if (marker === 0xff) {
      offset += 1;
      continue;
    }
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
      offset += 2;
      continue;
    }
    if (marker === 0xd9 || marker === 0xda) return null;

    const length = uint16BE(bytes, offset + 2);
    if (length < 2) return null;

    // Start-of-frame markers, excluding DHT (C4), JPG (C8), and DAC (CC).
    const isFrame =
      marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc;

    if (isFrame) {
      if (offset + 9 > bytes.length) return null;
      return {
        mimeType: "image/jpeg",
        height: uint16BE(bytes, offset + 5),
        width: uint16BE(bytes, offset + 7),
      };
    }

    offset += 2 + length;
  }

  return null;
}

// Identify a supported raster image from its leading bytes.
export function readImageInfo(bytes: Uint8Array): ImageInfo | null {
  return readPng(bytes) ?? readJpeg(bytes) ?? readGif(bytes) ?? readWebp(bytes);
}

export function validateMediaUpload(bytes: Uint8Array): MediaValidation {
  if (bytes.length === 0) return { ok: false, reason: "empty" };
  if (bytes.length > maxMediaBytes) return { ok: false, reason: "too-large" };

  const info = readImageInfo(bytes);
  if (!info) return { ok: false, reason: "unsupported-type" };

  if (
    info.width < 1 ||
    info.height < 1 ||
    info.width > maxMediaDimension ||
    info.height > maxMediaDimension
  ) {
    return { ok: false, reason: "invalid-dimensions" };
  }

  return { ok: true, info };
}
