"use server";

import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";

import { getEditorialContext } from "@/lib/auth/editorial";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { mediaBucket } from "./url";
import { maxMediaBytes, validateMediaUpload } from "./validation";
import { revalidateLocalizedPath } from "@/lib/revalidate";

export type UploadedMedia = {
  id: string;
  width: number;
  height: number;
};

export type UploadMediaResult =
  | { ok: true; media: UploadedMedia }
  | { ok: false; error: string };

// Validation reasons mapped to adminMedia.upload catalog keys.
const rejectionKeys = {
  empty: "empty",
  "too-large": "tooLarge",
  "unsupported-type": "unsupportedType",
  "invalid-dimensions": "invalidDimensions",
} as const;

function failure(error: string): UploadMediaResult {
  return { ok: false, error };
}

// Upload flow: validate the bytes on the server, upload with the caller's
// session so Storage policies (membership, path, rate limit) apply, then
// register the object through an RPC that re-reads type and size from Storage.
// The service-role key is not used. If registration fails, the unregistered
// object is removed; the Storage delete policy admits that for its owner.
export async function uploadMediaAction(
  formData: FormData,
): Promise<UploadMediaResult> {
  const [context, t, tActions] = await Promise.all([
    getEditorialContext(),
    getTranslations("adminMedia.upload"),
    getTranslations("admin.actions"),
  ]);
  const maxMegabytes = maxMediaBytes / 1024 / 1024;

  if (!context.user) return failure(tActions("sessionMissing"));
  if (!context.membership) return failure(t("membershipRequired"));

  const file = formData.get("file");
  if (!(file instanceof File)) return failure(t("fileRequired"));

  // Check the declared size before reading the body into memory.
  if (file.size > maxMediaBytes) return failure(t("tooLarge", { max: maxMegabytes }));

  const bytes = new Uint8Array(await file.arrayBuffer());
  const validation = validateMediaUpload(bytes);

  if (!validation.ok) {
    return failure(t(rejectionKeys[validation.reason], { max: maxMegabytes }));
  }

  const { info } = validation;
  const mediaId = crypto.randomUUID();
  const supabase = await createServerSupabaseClient();
  const storage = supabase.storage.from(mediaBucket);

  const upload = await storage.upload(mediaId, bytes, {
    contentType: info.mimeType,
    // The path is a fresh UUID and objects are never overwritten.
    cacheControl: "31536000",
    upsert: false,
  });

  if (upload.error) {
    return failure(t("rejected"));
  }

  const { error } = await supabase.rpc("register_media", {
    p_media_id: mediaId,
    p_width: info.width,
    p_height: info.height,
  });

  if (error) {
    await storage.remove([mediaId]);
    return failure(t("registerFailed"));
  }

  revalidateLocalizedPath("/admin/media");

  return {
    ok: true,
    media: { id: mediaId, width: info.width, height: info.height },
  };
}

// Deletion is reference-aware: delete_media refuses media that any post body
// still uses. The Storage object is removed only after its row is gone.
export async function deleteMediaAction(formData: FormData): Promise<void> {
  const context = await getEditorialContext();

  if (!context.user) redirect("/login");
  if (!context.membership) redirect("/admin/media?error=forbidden");

  const mediaId = formData.get("mediaId");

  if (typeof mediaId !== "string" || !/^[0-9a-f-]{36}$/.test(mediaId)) {
    redirect("/admin/media?error=invalid");
  }

  const supabase = await createServerSupabaseClient();
  const { data: objectPath, error } = await supabase.rpc("delete_media", {
    p_media_id: mediaId,
  });

  if (error) {
    const reason =
      error.code === "23503"
        ? "in-use"
        : error.code === "42501"
          ? "forbidden"
          : error.code === "P0002"
            ? "not-found"
            : error.code === "PT429"
              ? "rate-limited"
              : "failed";
    redirect(`/admin/media?error=${reason}`);
  }

  const removal = await supabase.storage
    .from(mediaBucket)
    .remove([objectPath as string]);

  revalidateLocalizedPath("/admin/media");
  // Storage reports success with an empty list when a policy filtered the row.
  const removed = !removal.error && (removal.data?.length ?? 0) > 0;

  redirect(
    removed ? "/admin/media?status=deleted" : "/admin/media?error=object-remains",
  );
}
