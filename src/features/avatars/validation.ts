import { readImageInfo, type ImageInfo } from "@/features/media/validation";

// Server-side avatar validation. Like media uploads, the declared type and
// name are ignored: the type comes from the file signature. Avatars accept
// JPEG, PNG, and WebP only (no GIF, no SVG). The bucket config and
// public.assert_avatar_object repeat the type and size limits.
//
// No server-side resizing: the original is stored and next/image delivers a
// square, cropped (object-cover) rendition at the displayed size.

export const maxAvatarBytes = 2 * 1024 * 1024;
export const minAvatarDimension = 16;
export const maxAvatarDimension = 4096;

export const allowedAvatarTypes = ["image/jpeg", "image/png", "image/webp"] as const;

export type AvatarMimeType = (typeof allowedAvatarTypes)[number];

// Message keys under avatars.rejection; translate them with avatarLimitValues.
export type AvatarRejection = "empty" | "tooLarge" | "unsupportedType" | "invalidDimensions";

export const avatarLimitValues = {
  maxMegabytes: maxAvatarBytes / 1024 / 1024,
  min: minAvatarDimension,
  max: maxAvatarDimension,
} as const;

export type AvatarValidation =
  | { ok: true; info: ImageInfo & { mimeType: AvatarMimeType } }
  | { ok: false; reason: AvatarRejection };

function isAvatarType(value: string): value is AvatarMimeType {
  return (allowedAvatarTypes as readonly string[]).includes(value);
}

export function validateAvatarUpload(bytes: Uint8Array): AvatarValidation {
  if (bytes.length === 0) return { ok: false, reason: "empty" };
  if (bytes.length > maxAvatarBytes) return { ok: false, reason: "tooLarge" };

  const info = readImageInfo(bytes);
  if (!info || !isAvatarType(info.mimeType)) return { ok: false, reason: "unsupportedType" };

  if (
    info.width < minAvatarDimension ||
    info.height < minAvatarDimension ||
    info.width > maxAvatarDimension ||
    info.height > maxAvatarDimension
  ) {
    return { ok: false, reason: "invalidDimensions" };
  }

  return { ok: true, info: { ...info, mimeType: info.mimeType } };
}

// Up to two initials for the fallback, from the first and last words. Uses
// Turkish case mapping so "ilker" becomes "İ".
export function avatarInitials(name: string): string {
  const words = name.trim().split(/\s+/u).filter(Boolean);
  if (words.length === 0) return "?";

  const first = [...words[0]][0] ?? "";
  const last = words.length > 1 ? ([...words[words.length - 1]][0] ?? "") : "";

  return `${first}${last}`.toLocaleUpperCase("tr-TR");
}
