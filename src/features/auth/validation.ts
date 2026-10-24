// Mirrors the profiles_display_name_length CHECK constraint (1–120 characters
// after trimming).
export const displayNameMaxLength = 120;

// The error is a message key under auth.displayName; translate it with
// { max: displayNameMaxLength }.
export type DisplayNameError = "required" | "tooLong";

export type DisplayNameResult =
  | { ok: true; value: string }
  | { ok: false; error: DisplayNameError };

export function validateDisplayName(value: string): DisplayNameResult {
  const trimmed = value.trim().replace(/\s+/g, " ");

  if (!trimmed) {
    return { ok: false, error: "required" };
  }

  if (trimmed.length > displayNameMaxLength) {
    return { ok: false, error: "tooLong" };
  }

  return { ok: true, value: trimmed };
}
