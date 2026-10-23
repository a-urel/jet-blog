"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { getEditorialContext } from "@/lib/auth/editorial";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { mediaBucket } from "./url";
import { maxMediaBytes, validateMediaUpload } from "./validation";

export type UploadedMedia = {
  id: string;
  width: number;
  height: number;
};

export type UploadMediaResult =
  | { ok: true; media: UploadedMedia }
  | { ok: false; error: string };

const rejectionMessages = {
  empty: "Dosya boş.",
  "too-large": `Dosya en fazla ${maxMediaBytes / 1024 / 1024} MB olabilir.`,
  "unsupported-type": "Yalnızca JPEG, PNG, WebP ve GIF görseller yüklenebilir.",
  "invalid-dimensions": "Görsel boyutları 1–10000 piksel arasında olmalı.",
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
  const context = await getEditorialContext();

  if (!context.user) return failure("Oturum bulunamadı. Yeniden giriş yapın.");
  if (!context.membership) {
    return failure("Görsel yüklemek için editöryal üyelik gerekir.");
  }

  const file = formData.get("file");
  if (!(file instanceof File)) return failure("Bir görsel dosyası seçin.");

  // Check the declared size before reading the body into memory.
  if (file.size > maxMediaBytes) return failure(rejectionMessages["too-large"]);

  const bytes = new Uint8Array(await file.arrayBuffer());
  const validation = validateMediaUpload(bytes);

  if (!validation.ok) return failure(rejectionMessages[validation.reason]);

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
    return failure(
      "Yükleme reddedildi. Yetkinizi kontrol edin veya birkaç dakika sonra tekrar deneyin (10 dakikada en fazla 20 görsel).",
    );
  }

  const { error } = await supabase.rpc("register_media", {
    p_media_id: mediaId,
    p_width: info.width,
    p_height: info.height,
  });

  if (error) {
    await storage.remove([mediaId]);
    return failure("Görsel kaydedilemedi. Tekrar deneyin.");
  }

  revalidatePath("/admin/media");

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

  revalidatePath("/admin/media");
  // Storage reports success with an empty list when a policy filtered the row.
  const removed = !removal.error && (removal.data?.length ?? 0) > 0;

  redirect(
    removed ? "/admin/media?status=deleted" : "/admin/media?error=object-remains",
  );
}
