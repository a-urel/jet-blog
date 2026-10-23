// Mirrors the profiles_display_name_length CHECK constraint (1–120 characters
// after trimming).
export const displayNameMaxLength = 120;

export type DisplayNameResult =
  | { ok: true; value: string }
  | { ok: false; message: string };

export function validateDisplayName(value: string): DisplayNameResult {
  const trimmed = value.trim().replace(/\s+/g, " ");

  if (!trimmed) {
    return { ok: false, message: "Görünen ad gerekli." };
  }

  if (trimmed.length > displayNameMaxLength) {
    return { ok: false, message: "Görünen ad 120 karakteri aşamaz." };
  }

  return { ok: true, value: trimmed };
}
