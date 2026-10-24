// Pure comment rules shared by the Server Actions, the client components, and
// unit tests. Kept free of server-only imports. The database enforces the same
// limits (supabase/migrations/20261023220000_comments.sql); these checks only
// give the reader a precise message before a round trip.

export const commentBodyMaxLength = 2000;

export type CommentStatus = "visible" | "hidden" | "deleted";

export const commentReportReasons = ["spam", "abuse", "off_topic", "other"] as const;

export type CommentReportReason = (typeof commentReportReasons)[number];

export const commentReportReasonLabels: Record<CommentReportReason, string> = {
  spam: "Spam veya reklam",
  abuse: "Hakaret, taciz veya nefret söylemi",
  off_topic: "Konu dışı",
  other: "Diğer",
};

export const commentStatusLabels: Record<CommentStatus, string> = {
  visible: "Görünür",
  hidden: "Gizlendi",
  deleted: "Silindi",
};

const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(value: unknown): value is string {
  return typeof value === "string" && uuidPattern.test(value);
}

export function isCommentReportReason(value: unknown): value is CommentReportReason {
  return (
    typeof value === "string" &&
    (commentReportReasons as readonly string[]).includes(value)
  );
}

export function isCommentStatus(value: unknown): value is CommentStatus {
  return value === "visible" || value === "hidden" || value === "deleted";
}

export type CommentBodyResult =
  | { ok: true; value: string }
  | { ok: false; message: string };

// Plain text only: line endings are normalized, control characters other than
// newline and tab are removed, runs of blank lines collapse to one, and the
// result is trimmed. Length counts code points, like Postgres char_length.
export function normalizeCommentBody(value: string): CommentBodyResult {
  const normalized = value
    .replace(/\r\n?/g, "\n")
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  if (!normalized) {
    return { ok: false, message: "Yorum boş olamaz." };
  }

  if ([...normalized].length > commentBodyMaxLength) {
    return {
      ok: false,
      message: `Yorum en fazla ${commentBodyMaxLength} karakter olabilir.`,
    };
  }

  return { ok: true, value: normalized };
}

export type CommentActionResult =
  | { status: "ok" }
  | { status: "unauthenticated" }
  | { status: "invalid"; message: string }
  | { status: "display-name-required" }
  | { status: "unavailable" }
  | { status: "duplicate" }
  | { status: "rate-limited" }
  | { status: "forbidden" }
  | { status: "error" };

export const commentMessages = {
  "display-name-required": "Yorum yapmadan önce hesabınızda bir görünen ad belirleyin.",
  unavailable: "Bu yorum veya yazı şu anda kullanılamıyor.",
  duplicate: "Bu yorumu kısa süre önce zaten gönderdiniz.",
  "rate-limited": "Çok fazla istek gönderdiniz. Bir süre sonra tekrar deneyin.",
  forbidden: "Bu işlem için yetkiniz yok.",
  error: "İşlem tamamlanamadı. Tekrar deneyin.",
} as const;

// ?status= values after a moderation action on /admin/comments; the value is
// the comment's new status.
export const moderationStatusMessages: Record<CommentStatus, string> = {
  hidden: "Yorum gizlendi; artık sitede görünmüyor.",
  visible: "Yorum yeniden gösteriliyor.",
  deleted: "Yorum silindi.",
};

export function moderationStatusMessage(value: unknown): string | null {
  return isCommentStatus(value) ? moderationStatusMessages[value] : null;
}

// Comment insert errors. 23502 is the missing display-name snapshot (the
// profile has no display name). A failed RLS check (42501) or foreign key
// (23503) means the post is not published or does not exist; neither reveals
// whether a draft exists.
export function commentInsertErrorResult(error: { code?: string }): CommentActionResult {
  switch (error.code) {
    case "23502":
      return { status: "display-name-required" };
    case "42501":
    case "23503":
      return { status: "unavailable" };
    case "PT409":
      return { status: "duplicate" };
    case "PT429":
      return { status: "rate-limited" };
    default:
      return { status: "error" };
  }
}

// Report insert errors. An existing report (23505) is the requested state.
// 42501 means the comment is no longer reportable: hidden, deleted, on an
// unpublished post, or the caller's own.
export function reportInsertErrorResult(error: { code?: string }): CommentActionResult {
  switch (error.code) {
    case "23505":
      return { status: "ok" };
    case "42501":
    case "23503":
      return { status: "unavailable" };
    case "PT429":
      return { status: "rate-limited" };
    default:
      return { status: "error" };
  }
}

export function moderationErrorResult(error: { code?: string }): CommentActionResult {
  switch (error.code) {
    case "42501":
      return { status: "forbidden" };
    case "P0002":
    case "23514":
      return { status: "unavailable" };
    default:
      return { status: "error" };
  }
}
