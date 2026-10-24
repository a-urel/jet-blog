// Error keys for ?error= on the admin post page and their Turkish copy. Kept
// out of the Server Action module, which may export only async functions.
export type PublicationErrorKey =
  | "forbidden"
  | "conflict"
  | "category"
  | "cover"
  | "body"
  | "state"
  | "missing"
  | "rate-limited"
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
      return error.message?.includes("Cover") ? "cover" : "category";
    case "22023":
      if (error.message?.includes("cover")) return "cover";
      return error.message?.includes("post body") ||
        error.message?.includes("content version")
        ? "body"
        : "failed";
    case "55000":
      return "state";
    case "P0002":
      return "missing";
    case "PT429":
      return "rate-limited";
    default:
      return "failed";
  }
}

export const publicationErrorMessages: Record<PublicationErrorKey, string> = {
  forbidden: "Yazı yayınlama ve yayından kaldırma yalnızca editörlere ve adminlere açıktır.",
  conflict:
    "Bu yazı sayfa açıldıktan sonra değişti. Sayfayı yenileyip güncel sürümle tekrar deneyin.",
  category: "Yayınlamak için önce bir kategori seçip kaydedin.",
  cover:
    "Kapak görseli için alternatif metin girip kaydedin veya kapağı kaldırın; yayınlanan kapak, ekran okuyucular için bir açıklama gerektirir.",
  body: "Yazı gövdesi geçersiz olduğu için yayınlanamadı.",
  state: "Yazının durumu bu işlem için uygun değil. Sayfayı yenileyin.",
  missing: "Yazı bulunamadı veya erişim yetkiniz yok.",
  "rate-limited":
    "Kısa sürede çok fazla yayınlama işlemi yapıldı (saatte en fazla 30). Biraz sonra tekrar deneyin.",
  failed: "İşlem tamamlanamadı. Tekrar deneyin.",
};

export function publicationErrorMessage(value: unknown): string | null {
  return typeof value === "string" && Object.hasOwn(publicationErrorMessages, value)
    ? publicationErrorMessages[value as PublicationErrorKey]
    : null;
}

export type PublicationConfirmation = {
  trigger: string;
  title: string;
  description: string;
  confirm: string;
};

// Copy for the confirmation dialog in front of publish and unpublish. Both
// actions change what anonymous readers see at once, so neither runs on the
// first click.
export function publicationConfirmation(
  published: boolean,
  title: string,
): PublicationConfirmation {
  return published
    ? {
        trigger: "Yayından kaldır",
        title: "Yazı yayından kaldırılsın mı?",
        description: `“${title}” taslağa döner; genel sayfa, listeler, arama ve akış onu hemen göstermeyi bırakır. Daha sonra yeniden yayınlayabilirsiniz.`,
        confirm: "Yayından kaldır",
      }
    : {
        trigger: "Yayınla",
        title: "Yazı yayınlansın mı?",
        description: `“${title}” kaydedilmiş son sürümüyle herkese açık olur; ana sayfada, arşivlerde, aramada ve akışta görünür. Kaydedilmemiş değişiklikler yayına girmez.`,
        confirm: "Yayınla",
      };
}
