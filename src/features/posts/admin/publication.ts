// Error keys for ?error= on the admin post page and their Turkish copy. Kept
// out of the Server Action module, which may export only async functions.
export type PublicationErrorKey =
  | "forbidden"
  | "conflict"
  | "category"
  | "body"
  | "state"
  | "missing"
  | "failed";

export function publicationErrorKey(error: {
  code?: string;
  message?: string;
} | null): PublicationErrorKey {
  switch (error?.code) {
    case "42501":
      return "forbidden";
    case "40001":
      return "conflict";
    case "23514":
      return "category";
    case "22023":
      return error.message?.includes("post body") ||
        error.message?.includes("content version")
        ? "body"
        : "failed";
    case "55000":
      return "state";
    case "P0002":
      return "missing";
    default:
      return "failed";
  }
}

export const publicationErrorMessages: Record<PublicationErrorKey, string> = {
  forbidden: "Yazı yayınlama ve yayından kaldırma yalnızca editörlere ve adminlere açıktır.",
  conflict:
    "Bu yazı sayfa açıldıktan sonra değişti. Sayfayı yenileyip güncel sürümle tekrar deneyin.",
  category: "Yayınlamak için önce bir kategori seçip kaydedin.",
  body: "Yazı gövdesi geçersiz olduğu için yayınlanamadı.",
  state: "Yazının durumu bu işlem için uygun değil. Sayfayı yenileyin.",
  missing: "Yazı bulunamadı veya erişim yetkiniz yok.",
  failed: "İşlem tamamlanamadı. Tekrar deneyin.",
};

export function publicationErrorMessage(value: unknown): string | null {
  return typeof value === "string" && Object.hasOwn(publicationErrorMessages, value)
    ? publicationErrorMessages[value as PublicationErrorKey]
    : null;
}
