import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { getTranslations } from "next-intl/server";

import { avatarObjectName, avatarsBucket, type AvatarKind } from "./url";
import { avatarLimitValues, maxAvatarBytes, validateAvatarUpload } from "./validation";

export type AvatarUploadResult =
  | { ok: true; avatarId: string }
  | { ok: false; error: string };

// Validates the bytes on the server, then uploads with the caller's session so
// the Storage policies (kind, admin-only author avatars, rate limit) apply. The
// object is not in use until an RPC attaches it; callers remove it again when
// attaching fails. The error is already translated into the interface
// language, so the calling Server Action can return it as is.
export async function uploadAvatarObject(
  supabase: SupabaseClient,
  kind: AvatarKind,
  file: FormDataEntryValue | null,
): Promise<AvatarUploadResult> {
  const t = await getTranslations("avatars.rejection");

  if (!(file instanceof File) || file.size === 0) {
    return { ok: false, error: t("noFile") };
  }

  // Check the declared size before reading the body into memory.
  if (file.size > maxAvatarBytes) {
    return { ok: false, error: t("tooLarge", avatarLimitValues) };
  }

  const bytes = new Uint8Array(await file.arrayBuffer());
  const validation = validateAvatarUpload(bytes);
  if (!validation.ok) {
    return { ok: false, error: t(validation.reason, avatarLimitValues) };
  }

  const avatarId = crypto.randomUUID();
  const { error } = await supabase.storage
    .from(avatarsBucket)
    .upload(avatarObjectName(kind, avatarId), bytes, {
      contentType: validation.info.mimeType,
      // The name is a fresh UUID and objects are never overwritten.
      cacheControl: "31536000",
      upsert: false,
    });

  if (error) {
    return { ok: false, error: t("uploadRefused") };
  }

  return { ok: true, avatarId };
}

// Removes detached avatar objects. The Storage delete policy refuses objects
// still in use and other users' objects; Storage then reports success with
// fewer rows, so the result is the number actually removed.
export async function removeAvatarObjects(
  supabase: SupabaseClient,
  kind: AvatarKind,
  avatarIds: (string | null | undefined)[],
): Promise<number> {
  const names = avatarIds
    .filter((id): id is string => typeof id === "string" && id.length > 0)
    .map((id) => avatarObjectName(kind, id));
  if (names.length === 0) return 0;

  const { data, error } = await supabase.storage.from(avatarsBucket).remove(names);
  if (error) return 0;

  return data?.length ?? 0;
}

// Every profile avatar object the caller can see: the Storage select policy
// limits profiles/ to the uploader. Used by account deletion to remove the
// current picture and any upload that was never attached.
export async function listOwnProfileAvatarIds(supabase: SupabaseClient): Promise<string[]> {
  const { data, error } = await supabase.storage
    .from(avatarsBucket)
    .list("profiles", { limit: 1000 });
  if (error) return [];

  return (data ?? []).flatMap((entry) => (entry.id ? [entry.name] : []));
}
