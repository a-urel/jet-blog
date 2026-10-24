"use server";

import { updateTag } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@supabase/supabase-js";
import { getTranslations } from "next-intl/server";

import { consumeAuthRateLimit } from "@/features/auth/rate-limit";
import { displayNameMaxLength, validateDisplayName } from "@/features/auth/validation";
import type { AvatarFormState } from "@/features/avatars/form-state";
import {
  listOwnProfileAvatarIds,
  removeAvatarObjects,
  uploadAvatarObject,
} from "@/features/avatars/storage";
import { commentsCacheTag, publicCommentsCacheTag } from "@/features/comments/cache";
import { getSessionUser } from "@/lib/auth/session";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import {
  getSupabaseEnvironment,
  isSupabaseAdminConfigured,
} from "@/lib/supabase/env";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { revalidateLocalizedPath } from "@/lib/revalidate";

export type DisplayNameState = {
  status: "idle" | "error" | "success";
  message: string | null;
  value?: string;
};

export type DeleteAccountState = {
  error: string | null;
};


// Every account action takes the user from the verified session. No action
// accepts a user id, role, or email from the form.
export async function updateDisplayNameAction(
  _previousState: DisplayNameState,
  formData: FormData,
): Promise<DisplayNameState> {
  const [t, tAuth] = await Promise.all([
    getTranslations("account"),
    getTranslations("auth"),
  ]);
  const value = formData.get("displayName");
  if (typeof value !== "string") {
    return { status: "error", message: tAuth("displayName.required") };
  }

  const result = validateDisplayName(value);
  if (!result.ok) {
    return {
      status: "error",
      message: tAuth(`displayName.${result.error}`, { max: displayNameMaxLength }),
      value,
    };
  }

  const user = await getSessionUser();
  if (!user) return { status: "error", message: t("missingSession") };

  const supabase = await createServerSupabaseClient();
  // RLS limits the update to the caller's own row and the column grant to
  // display_name; the filter only names that row.
  const { data, error } = await supabase
    .from("profiles")
    .update({ display_name: result.value })
    .eq("id", user.id)
    .select("display_name")
    .maybeSingle();

  if (error || !data) {
    return {
      status: "error",
      message: t("displayName.saveFailed"),
      value: result.value,
    };
  }

  revalidateLocalizedPath("/account");

  return {
    status: "success",
    message: t("displayName.saved"),
    value: result.value,
  };
}

type OwnAvatarChange = {
  previous_avatar_id: string | null;
  post_ids: string[] | null;
  post_slugs: string[] | null;
};

// Message keys under account.avatar.
function ownAvatarErrorKey(code: string | undefined) {
  switch (code) {
    case "PT429":
      return "rateLimited" as const;
    case "P0002":
    case "22023":
      return "rejected" as const;
    default:
      return "saveFailed" as const;
  }
}

// Attaches (or, with null, removes) the caller's avatar through
// set_own_avatar(), deletes the detached object, and refreshes the public
// pages whose comments show the caller's picture: one tag and one literal
// path per post (src/features/comments/cache.ts). Returns an error message or
// null on success.
async function setOwnAvatar(avatarId: string | null): Promise<string | null> {
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase
    .rpc("set_own_avatar", { p_avatar_id: avatarId })
    .single<OwnAvatarChange>();

  if (error || !data) {
    const t = await getTranslations("account.avatar");
    return t(ownAvatarErrorKey(error?.code));
  }

  await removeAvatarObjects(supabase, "profiles", [data.previous_avatar_id]);

  (data.post_ids ?? []).forEach((postId) => updateTag(commentsCacheTag(postId)));
  (data.post_slugs ?? []).forEach((slug) => revalidateLocalizedPath(`/posts/${slug}`));
  revalidateLocalizedPath("/account");

  return null;
}

export async function updateOwnAvatarAction(
  _previousState: AvatarFormState,
  formData: FormData,
): Promise<AvatarFormState> {
  const t = await getTranslations("account");
  const user = await getSessionUser();
  if (!user) return { status: "error", message: t("missingSession") };

  const supabase = await createServerSupabaseClient();
  const upload = await uploadAvatarObject(supabase, "profiles", formData.get("avatar"));
  if (!upload.ok) return { status: "error", message: upload.error };

  const failure = await setOwnAvatar(upload.avatarId);
  if (failure) {
    await removeAvatarObjects(supabase, "profiles", [upload.avatarId]);
    return { status: "error", message: failure };
  }

  return { status: "success", message: t("avatar.saved") };
}

// Used as a form action through useActionState; it needs neither the previous
// state nor form data.
export async function removeOwnAvatarAction(): Promise<AvatarFormState> {
  const t = await getTranslations("account");
  const user = await getSessionUser();
  if (!user) return { status: "error", message: t("missingSession") };

  const failure = await setOwnAvatar(null);
  if (failure) return { status: "error", message: failure };

  return { status: "success", message: t("avatar.removed") };
}

export async function deleteAccountAction(
  _previousState: DeleteAccountState,
  formData: FormData,
): Promise<DeleteAccountState> {
  const [t, tAuth] = await Promise.all([
    getTranslations("account"),
    getTranslations("auth"),
  ]);
  const password = formData.get("password");
  const confirmed = formData.get("confirmDelete");

  if (typeof password !== "string" || !password) {
    return { error: t("delete.passwordRequired") };
  }

  if (confirmed !== "on") {
    return { error: t("delete.confirmRequired") };
  }

  const user = await getSessionUser();
  if (!user?.email) return { error: t("missingSession") };

  if (!isSupabaseAdminConfigured()) {
    return { error: tAuth("rateLimit.unavailable") };
  }

  // Re-entering the password counts as a sign-in attempt, so a stolen session
  // cannot be used to brute-force it here either.
  const rateLimit = await consumeAuthRateLimit("auth.sign_in", user.email);
  if (rateLimit !== "allowed") {
    return { error: tAuth(`rateLimit.${rateLimit}`) };
  }

  // Verify the password with a stateless client so the request's own session
  // cookies stay untouched, and confirm it belongs to the same account.
  const { url, publishableKey } = getSupabaseEnvironment();
  const verifier = createClient(url, publishableKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
  const { data: verified, error: verifyError } =
    await verifier.auth.signInWithPassword({ email: user.email, password });

  if (verifyError || verified.user?.id !== user.id) {
    return { error: t("delete.wrongPassword") };
  }

  await verifier.auth.signOut({ scope: "local" }).catch(() => null);

  const supabase = await createServerSupabaseClient();
  const { error: preflightError } = await supabase.rpc(
    "prepare_own_account_deletion",
  );

  if (preflightError) {
    if (preflightError.code === "23514") {
      return { error: t("delete.activeAdminError") };
    }

    return { error: t("delete.failed") };
  }

  // The preflight detached the profile avatar. Remove it and any upload that
  // was never attached with the caller's session; the Storage policies admit
  // exactly these objects. The comment pages refreshed below drop the picture.
  const avatarIds = await listOwnProfileAvatarIds(supabase);
  await removeAvatarObjects(supabase, "profiles", avatarIds);

  // The secret-key client is used only for this one Auth admin call, with the
  // id taken from the verified session above.
  const admin = createAdminSupabaseClient();
  const { error: deleteError } = await admin.auth.admin.deleteUser(user.id);

  if (deleteError) {
    return { error: t("delete.failed") };
  }

  // The Auth user and its sessions are gone; clear the local cookies.
  await supabase.auth.signOut({ scope: "local" }).catch(() => null);

  // The preflight anonymized the caller's comments, possibly on many posts:
  // drop every cached comment read and regenerate post pages so the old
  // display name and avatar leave public output (src/features/comments/cache.ts).
  updateTag(publicCommentsCacheTag);
  revalidateLocalizedPath("/posts/[slug]", "page");
  revalidateLocalizedPath("/account", "layout");
  revalidateLocalizedPath("/admin", "layout");
  redirect("/login?account=deleted");
}
