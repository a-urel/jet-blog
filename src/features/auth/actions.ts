"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { getSessionUser } from "@/lib/auth/session";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export type SignInState = {
  error: string | null;
};

export type UpdatePasswordState = {
  error: string | null;
};

const invalidCredentialsMessage = "E-posta veya parola hatalı.";
const missingFieldsMessage = "E-posta ve parola gerekli.";

export async function signInAction(
  _previousState: SignInState,
  formData: FormData,
): Promise<SignInState> {
  const email = formData.get("email");
  const password = formData.get("password");

  if (typeof email !== "string" || typeof password !== "string") {
    return { error: missingFieldsMessage };
  }

  const normalizedEmail = email.trim();

  if (!normalizedEmail || !password) {
    return { error: missingFieldsMessage };
  }

  const supabase = await createServerSupabaseClient();
  const { error } = await supabase.auth.signInWithPassword({
    email: normalizedEmail,
    password,
  });

  if (error) {
    return { error: invalidCredentialsMessage };
  }

  revalidatePath("/admin", "layout");
  redirect("/admin");
}

const passwordTooShortMessage = "Parola en az 8 karakter olmalı.";
const passwordMismatchMessage = "Parolalar eşleşmiyor.";
const passwordMissingSessionMessage =
  "Oturum bulunamadı. Davet bağlantısını yeniden açın.";

export async function updatePasswordAction(
  _previousState: UpdatePasswordState,
  formData: FormData,
): Promise<UpdatePasswordState> {
  const password = formData.get("password");
  const confirmPassword = formData.get("confirmPassword");

  if (typeof password !== "string" || typeof confirmPassword !== "string") {
    return { error: passwordTooShortMessage };
  }

  if (password.length < 8) {
    return { error: passwordTooShortMessage };
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
    return {
      error: "Parola güncellenemedi. Davet bağlantısını yeniden deneyin.",
    };
  }

  revalidatePath("/admin", "layout");
  redirect("/admin");
}

export async function signOutAction() {
  const supabase = await createServerSupabaseClient();

  await supabase.auth.signOut();

  revalidatePath("/admin", "layout");
  redirect("/login?signed-out=1");
}
