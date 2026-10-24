// Mirrors supabase/config.toml: minimum_password_length = 8 and
// password_requirements = "letters_digits". Supabase Auth enforces the same
// rule; checking it here first gives a localized message instead of an API
// error. bcrypt ignores bytes beyond 72, so longer passwords are rejected
// outright.
export const passwordMinLength = 8;
export const passwordMaxLength = 72;

// Message keys under auth.passwordPolicy; the boundary translates them with
// passwordPolicyValues.
export type PasswordPolicyError = "tooShort" | "tooLong" | "lettersDigits";

export const passwordPolicyValues = {
  min: passwordMinLength,
  max: passwordMaxLength,
} as const;

export function checkPasswordPolicy(password: string): PasswordPolicyError | null {
  if (password.length < passwordMinLength) return "tooShort";
  if (new TextEncoder().encode(password).length > passwordMaxLength) {
    return "tooLong";
  }
  if (!/\p{L}/u.test(password) || !/\p{Nd}/u.test(password)) {
    return "lettersDigits";
  }
  return null;
}
