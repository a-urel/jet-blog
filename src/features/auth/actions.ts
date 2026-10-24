"use server";

import { redirect } from "next/navigation";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getTranslations } from "next-intl/server";

import { getAppOrigin } from "@/lib/app-origin";
import { getSessionUser } from "@/lib/auth/session";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { checkPasswordPolicy, passwordPolicyValues } from "./password-policy";
import { consumeAuthRateLimit } from "./rate-limit";
import { normalizeEmail } from "./rate-limit-subjects";
import { returnPathForMember } from "./return-path";
import { displayNameMaxLength, validateDisplayName } from "./validation";
import { revalidateLocalizedPath } from "@/lib/revalidate";

export type SignInState = {
  error: string | null;
};

export type UpdatePasswordState = {
  error: string | null;
};

export type SignUpState = {
  status: "idle" | "error" | "success";
  message: string | null;
};

export type PasswordResetRequestState = {
  status: "idle" | "error" | "success";
  message: string | null;
};

function isValidEmail(email: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) && email.length <= 320;
}

// Only the dynamic, per-user layouts. Never revalidate "/" here: that would
// expire every public ISR page on each sign-in.
function revalidateSignedInRoutes() {
  revalidateLocalizedPath("/admin", "layout");
  revalidateLocalizedPath("/account", "layout");
}

// Editorial members land in /admin; everyone else is a reader. The membership
// is read through the caller's own session, so RLS decides what is visible.
async function homePathFor(supabase: SupabaseClient, userId: string) {
  const { data } = await supabase
    .from("editorial_members")
    .select("deactivated_at")
    .eq("profile_id", userId)
    .maybeSingle();

  return data && data.deactivated_at === null ? "/admin" : "/account";
}

export async function signInAction(
  _previousState: SignInState,
  formData: FormData,
): Promise<SignInState> {
  const t = await getTranslations("auth");
  const email = formData.get("email");
  const password = formData.get("password");

  if (typeof email !== "string" || typeof password !== "string") {
    return { error: t("errors.missingFields") };
  }

  const normalizedEmail = normalizeEmail(email);

  if (!normalizedEmail || !password) {
    return { error: t("errors.missingFields") };
  }

  const rateLimit = await consumeAuthRateLimit("auth.sign_in", normalizedEmail);
  if (rateLimit !== "allowed") {
    return { error: t(`rateLimit.${rateLimit}`) };
  }

  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase.auth.signInWithPassword({
    email: normalizedEmail,
    password,
  });

  if (error || !data.user) {
    // Supabase checks the password before the confirmation state, so this
    // message only reaches someone who already knows the password.
    if (error?.code === "email_not_confirmed") {
      return { error: t("errors.emailNotConfirmed") };
    }

    return { error: t("errors.invalidCredentials") };
  }

  // A validated ?next= path (for example the post a visitor tried to save, or
  // the admin page an editor opened) wins over the role-based home path; an
  // /admin path counts only for an active editorial member.
  const rolePath = await homePathFor(supabase, data.user.id);
  const home = returnPathForMember(formData.get("next"), rolePath === "/admin") ?? rolePath;

  revalidateSignedInRoutes();
  redirect(home);
}

export async function signUpAction(
  _previousState: SignUpState,
  formData: FormData,
): Promise<SignUpState> {
  const t = await getTranslations("auth");
  const email = formData.get("email");
  const password = formData.get("password");
  const confirmPassword = formData.get("confirmPassword");
  const displayNameValue = formData.get("displayName");

  if (
    typeof email !== "string" ||
    typeof password !== "string" ||
    typeof confirmPassword !== "string" ||
    typeof displayNameValue !== "string"
  ) {
    return { status: "error", message: t("errors.allFieldsRequired") };
  }

  const displayName = validateDisplayName(displayNameValue);
  if (!displayName.ok) {
    return {
      status: "error",
      message: t(`displayName.${displayName.error}`, { max: displayNameMaxLength }),
    };
  }

  const normalizedEmail = normalizeEmail(email);
  if (!isValidEmail(normalizedEmail)) {
    return { status: "error", message: t("errors.invalidEmail") };
  }

  const policyError = checkPasswordPolicy(password);
  if (policyError) {
    return {
      status: "error",
      message: t(`passwordPolicy.${policyError}`, passwordPolicyValues),
    };
  }

  if (password !== confirmPassword) {
    return { status: "error", message: t("errors.passwordMismatch") };
  }

  const rateLimit = await consumeAuthRateLimit("auth.sign_up", normalizedEmail);
  if (rateLimit !== "allowed") {
    return { status: "error", message: t(`rateLimit.${rateLimit}`) };
  }

  const origin = await getAppOrigin();
  const supabase = await createServerSupabaseClient();
  // Only the display name goes into user metadata. Nothing reads metadata for
  // authorization; the profile trigger copies the bounded name and the
  // account never receives an editorial grant from sign-up.
  const { error } = await supabase.auth.signUp({
    email: normalizedEmail,
    password,
    options: {
      emailRedirectTo: `${origin}/auth/callback`,
      data: { display_name: displayName.value },
    },
  });

  // An existing email gets the same answer as a new one. Supabase normally
  // returns an obfuscated user here (config: email and phone confirmations
  // on); mapping the explicit error too keeps the response identical if a
  // project setting drifts.
  if (error && error.code !== "user_already_exists") {
    if (error.code === "weak_password") {
      return {
        status: "error",
        message: t("passwordPolicy.lettersDigits"),
      };
    }

    if (error.code === "over_email_send_rate_limit") {
      return { status: "error", message: t("rateLimit.limited") };
    }

    return { status: "error", message: t("errors.signUpFailed") };
  }

  return { status: "success", message: t("success.signUp") };
}

export async function requestPasswordResetAction(
  _previousState: PasswordResetRequestState,
  formData: FormData,
): Promise<PasswordResetRequestState> {
  const t = await getTranslations("auth");
  const email = formData.get("email");

  if (typeof email !== "string") {
    return { status: "error", message: t("errors.invalidEmail") };
  }

  const normalizedEmail = normalizeEmail(email);
  if (!isValidEmail(normalizedEmail)) {
    return { status: "error", message: t("errors.invalidEmail") };
  }

  // The limit depends only on the submitted email and the client, never on
  // whether an account exists.
  const rateLimit = await consumeAuthRateLimit(
    "auth.password_reset",
    normalizedEmail,
  );
  if (rateLimit !== "allowed") {
    return { status: "error", message: t(`rateLimit.${rateLimit}`) };
  }

  const origin = await getAppOrigin();
  const supabase = await createServerSupabaseClient();

  // Every Auth outcome, including errors that only occur for existing users
  // (such as the per-user email frequency limit), returns the same response so
  // the form never reveals whether the email is registered.
  await supabase.auth
    .resetPasswordForEmail(normalizedEmail, {
      redirectTo: `${origin}/auth/recovery`,
    })
    .catch(() => null);

  return { status: "success", message: t("success.passwordResetSent") };
}

export async function updatePasswordAction(
  _previousState: UpdatePasswordState,
  formData: FormData,
): Promise<UpdatePasswordState> {
  const t = await getTranslations("auth");
  const password = formData.get("password");
  const confirmPassword = formData.get("confirmPassword");

  if (typeof password !== "string" || typeof confirmPassword !== "string") {
    return { error: t("passwordPolicy.tooShort", passwordPolicyValues) };
  }

  const policyError = checkPasswordPolicy(password);
  if (policyError) {
    return { error: t(`passwordPolicy.${policyError}`, passwordPolicyValues) };
  }

  if (password !== confirmPassword) {
    return { error: t("errors.passwordMismatch") };
  }

  const user = await getSessionUser();
  if (!user) {
    return { error: t("errors.missingSession") };
  }

  const supabase = await createServerSupabaseClient();
  const { error } = await supabase.auth.updateUser({ password });

  if (error) {
    if (error.code === "same_password") {
      return { error: t("errors.samePassword") };
    }

    if (error.code === "weak_password") {
      return { error: t("passwordPolicy.lettersDigits") };
    }

    return { error: t("errors.passwordUpdateFailed") };
  }

  const home = await homePathFor(supabase, user.id);

  revalidateSignedInRoutes();
  redirect(home === "/admin" ? home : "/account?password=updated");
}

export async function signOutAction() {
  const supabase = await createServerSupabaseClient();

  await supabase.auth.signOut();

  revalidateSignedInRoutes();
  redirect("/login?signed-out=1");
}
