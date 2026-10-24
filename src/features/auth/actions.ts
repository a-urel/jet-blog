"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { SupabaseClient } from "@supabase/supabase-js";

import { getAppOrigin } from "@/lib/app-origin";
import { getSessionUser } from "@/lib/auth/session";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import {
  checkPasswordPolicy,
  passwordPolicyMessages,
} from "./password-policy";
import { authRateLimitMessages, consumeAuthRateLimit } from "./rate-limit";
import { normalizeEmail } from "./rate-limit-subjects";
import { returnPathForMember } from "./return-path";
import { validateDisplayName } from "./validation";

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

const invalidCredentialsMessage = "E-posta veya parola hatalı.";
const missingFieldsMessage = "E-posta ve parola gerekli.";
const emailNotConfirmedMessage =
  "E-posta adresiniz henüz doğrulanmadı. Gelen kutunuzdaki doğrulama bağlantısını açın.";
const invalidEmailMessage = "Geçerli bir e-posta girin.";

function isValidEmail(email: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) && email.length <= 320;
}

// Only the dynamic, per-user layouts. Never revalidate "/" here: that would
// expire every public ISR page on each sign-in.
function revalidateSignedInRoutes() {
  revalidatePath("/admin", "layout");
  revalidatePath("/account", "layout");
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
  const email = formData.get("email");
  const password = formData.get("password");

  if (typeof email !== "string" || typeof password !== "string") {
    return { error: missingFieldsMessage };
  }

  const normalizedEmail = normalizeEmail(email);

  if (!normalizedEmail || !password) {
    return { error: missingFieldsMessage };
  }

  const rateLimit = await consumeAuthRateLimit("auth.sign_in", normalizedEmail);
  if (rateLimit !== "allowed") {
    return { error: authRateLimitMessages[rateLimit] };
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
      return { error: emailNotConfirmedMessage };
    }

    return { error: invalidCredentialsMessage };
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
    return { status: "error", message: "Tüm alanları doldurun." };
  }

  const displayName = validateDisplayName(displayNameValue);
  if (!displayName.ok) {
    return { status: "error", message: displayName.message };
  }

  const normalizedEmail = normalizeEmail(email);
  if (!isValidEmail(normalizedEmail)) {
    return { status: "error", message: invalidEmailMessage };
  }

  const policyError = checkPasswordPolicy(password);
  if (policyError) {
    return { status: "error", message: passwordPolicyMessages[policyError] };
  }

  if (password !== confirmPassword) {
    return { status: "error", message: "Parolalar eşleşmiyor." };
  }

  const rateLimit = await consumeAuthRateLimit("auth.sign_up", normalizedEmail);
  if (rateLimit !== "allowed") {
    return { status: "error", message: authRateLimitMessages[rateLimit] };
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
        message: passwordPolicyMessages["letters-digits"],
      };
    }

    if (error.code === "over_email_send_rate_limit") {
      return { status: "error", message: authRateLimitMessages.limited };
    }

    return {
      status: "error",
      message: "Hesap oluşturulamadı. Daha sonra tekrar deneyin.",
    };
  }

  return {
    status: "success",
    message:
      "Doğrulama bağlantısı e-posta adresinize gönderildi. Hesabınızı etkinleştirmek için bağlantıyı aynı tarayıcıda açın.",
  };
}

const passwordResetSentMessage =
  "Bu adrese kayıtlı bir hesap varsa parola sıfırlama bağlantısı gönderildi. Gelen kutunuzu kontrol edin.";

export async function requestPasswordResetAction(
  _previousState: PasswordResetRequestState,
  formData: FormData,
): Promise<PasswordResetRequestState> {
  const email = formData.get("email");

  if (typeof email !== "string") {
    return { status: "error", message: invalidEmailMessage };
  }

  const normalizedEmail = normalizeEmail(email);
  if (!isValidEmail(normalizedEmail)) {
    return { status: "error", message: invalidEmailMessage };
  }

  // The limit depends only on the submitted email and the client, never on
  // whether an account exists.
  const rateLimit = await consumeAuthRateLimit(
    "auth.password_reset",
    normalizedEmail,
  );
  if (rateLimit !== "allowed") {
    return { status: "error", message: authRateLimitMessages[rateLimit] };
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

  return { status: "success", message: passwordResetSentMessage };
}

const passwordMismatchMessage = "Parolalar eşleşmiyor.";
const passwordMissingSessionMessage =
  "Oturum bulunamadı. Bağlantıyı yeniden açın veya yeniden giriş yapın.";

export async function updatePasswordAction(
  _previousState: UpdatePasswordState,
  formData: FormData,
): Promise<UpdatePasswordState> {
  const password = formData.get("password");
  const confirmPassword = formData.get("confirmPassword");

  if (typeof password !== "string" || typeof confirmPassword !== "string") {
    return { error: passwordPolicyMessages["too-short"] };
  }

  const policyError = checkPasswordPolicy(password);
  if (policyError) {
    return { error: passwordPolicyMessages[policyError] };
  }

  if (password !== confirmPassword) {
    return { error: passwordMismatchMessage };
  }

  const user = await getSessionUser();
  if (!user) {
    return { error: passwordMissingSessionMessage };
  }

  const supabase = await createServerSupabaseClient();
  const { error } = await supabase.auth.updateUser({ password });

  if (error) {
    if (error.code === "same_password") {
      return { error: "Yeni parola mevcut paroladan farklı olmalı." };
    }

    if (error.code === "weak_password") {
      return { error: passwordPolicyMessages["letters-digits"] };
    }

    return {
      error: "Parola güncellenemedi. Bağlantıyı yeniden açıp tekrar deneyin.",
    };
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
