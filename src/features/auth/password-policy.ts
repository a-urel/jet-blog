// Mirrors supabase/config.toml: minimum_password_length = 8 and
// password_requirements = "letters_digits". Supabase Auth enforces the same
// rule; checking it here first gives a Turkish message instead of an API error.
// bcrypt ignores bytes beyond 72, so longer passwords are rejected outright.
export const passwordMinLength = 8;
export const passwordMaxLength = 72;

export const passwordPolicyHint =
  "En az 8 karakter; en az bir harf ve bir rakam içermeli.";

export type PasswordPolicyError = "too-short" | "too-long" | "letters-digits";

export function checkPasswordPolicy(password: string): PasswordPolicyError | null {
  if (password.length < passwordMinLength) return "too-short";
  if (new TextEncoder().encode(password).length > passwordMaxLength) {
    return "too-long";
  }
  if (!/\p{L}/u.test(password) || !/\p{Nd}/u.test(password)) {
    return "letters-digits";
  }
  return null;
}

export const passwordPolicyMessages: Record<PasswordPolicyError, string> = {
  "too-short": "Parola en az 8 karakter olmalı.",
  "too-long": "Parola 72 bayttan uzun olamaz.",
  "letters-digits": "Parola en az bir harf ve bir rakam içermeli.",
};
