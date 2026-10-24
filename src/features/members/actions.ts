"use server";

import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";

import {
  getEditorialContext,
  isEditorialRole,
} from "@/lib/auth/editorial";
import { getAppOrigin } from "@/lib/app-origin";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { revalidateLocalizedPath } from "@/lib/revalidate";

const inviteRateLimitWindowMs = 60 * 60 * 1000;
const inviteRateLimitMax = 20;
// Matches the maxLength of the invite form field.
const displayNameMaxLength = 120;
const inviteRateLimitActions = [
  "member.invite",
  "member.granted_existing",
  "member.invite_failed",
];

export type InviteMemberState = {
  status: "idle" | "error" | "success";
  message: string | null;
};

function isValidEmail(email: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

async function findAuthUserByEmail(email: string) {
  const admin = createAdminSupabaseClient();
  const perPage = 200;

  for (let page = 1; page <= 25; page += 1) {
    const { data, error } = await admin.auth.admin.listUsers({
      page,
      perPage,
    });

    if (error) throw error;

    const match = data.users.find(
      (user) => user.email?.toLowerCase() === email,
    );

    if (match) return match;
    if (data.users.length < perPage) return null;
  }

  return null;
}

function mapMembershipRpcError(error: { code?: string } | null) {
  switch (error?.code) {
    case "42501":
      return "forbidden";
    case "22023":
      return "self";
    case "P0002":
      return "not-found";
    case "23514":
      return "last-admin";
    case "23505":
      return "already-member";
    default:
      return "unknown";
  }
}

export async function inviteMemberAction(
  _previousState: InviteMemberState,
  formData: FormData,
): Promise<InviteMemberState> {
  const [context, t, tAll] = await Promise.all([
    getEditorialContext(),
    getTranslations("adminMembers.inviteResult"),
    getTranslations(),
  ]);

  if (!context.user) {
    return { status: "error", message: tAll("admin.actions.sessionMissing") };
  }

  if (context.membership?.role !== "admin") {
    return { status: "error", message: tAll("adminMembers.errors.forbidden") };
  }

  const emailValue = formData.get("email");
  const roleValue = formData.get("role");
  const displayNameValue = formData.get("displayName");
  const confirmAdmin = formData.get("confirmAdmin");

  if (typeof emailValue !== "string") {
    return { status: "error", message: t("emailRequired") };
  }

  const email = emailValue.trim().toLowerCase();

  if (!isValidEmail(email)) {
    return { status: "error", message: t("emailInvalid") };
  }

  if (!isEditorialRole(roleValue)) {
    return { status: "error", message: t("roleInvalid") };
  }

  if (roleValue === "admin" && confirmAdmin !== "on") {
    return {
      status: "error",
      message: t("confirmAdmin"),
    };
  }

  const displayName =
    typeof displayNameValue === "string" ? displayNameValue.trim() : "";

  if (displayName.length > displayNameMaxLength) {
    return {
      status: "error",
      message: t("displayNameTooLong", { max: displayNameMaxLength }),
    };
  }

  const supabase = await createServerSupabaseClient();
  const windowStart = new Date(
    Date.now() - inviteRateLimitWindowMs,
  ).toISOString();

  const { count, error: rateLimitError } = await supabase
    .from("editorial_audit_log")
    .select("id", { count: "exact", head: true })
    .eq("actor_profile_id", context.user.id)
    .in("action", inviteRateLimitActions)
    .gte("created_at", windowStart);

  if (rateLimitError) {
    return {
      status: "error",
      message: t("verifyFailed"),
    };
  }

  if ((count ?? 0) >= inviteRateLimitMax) {
    return {
      status: "error",
      message: t("rateLimited"),
    };
  }

  try {
    const origin = await getAppOrigin();
    const admin = createAdminSupabaseClient();
    const { data: inviteData, error: inviteError } =
      await admin.auth.admin.inviteUserByEmail(email, {
        redirectTo: `${origin}/auth/confirm`,
        ...(displayName ? { data: { display_name: displayName } } : {}),
      });

    let targetUserId: string | null = null;
    let invited = false;

    if (inviteError) {
      const isExistingUser =
        inviteError.code === "email_exists" ||
        inviteError.code === "user_already_exists" ||
        /already/i.test(inviteError.message);

      if (!isExistingUser) {
        await supabase.rpc("record_editorial_audit", {
          p_action: "member.invite_failed",
          p_target_email: email,
          p_details: { reason: inviteError.code ?? "invite_failed" },
        });

        return {
          status: "error",
          message: t("sendFailed"),
        };
      }

      const existingUser = await findAuthUserByEmail(email);

      if (!existingUser) {
        await supabase.rpc("record_editorial_audit", {
          p_action: "member.invite_failed",
          p_target_email: email,
          p_details: { reason: "lookup_failed" },
        });

        return {
          status: "error",
          message: t("userNotFound"),
        };
      }

      // Public sign-up lets anyone register an email they do not own. Granting
      // membership to that unconfirmed account would hand editorial access to
      // whoever chose its password. The database trigger enforces the same.
      if (!existingUser.email_confirmed_at && !existingUser.invited_at) {
        await supabase.rpc("record_editorial_audit", {
          p_action: "member.invite_failed",
          p_target_profile_id: existingUser.id,
          p_details: { reason: "unconfirmed_account" },
        });

        return {
          status: "error",
          message: t("unconfirmed"),
        };
      }

      targetUserId = existingUser.id;
    } else {
      targetUserId = inviteData.user.id;
      invited = true;
    }

    if (!targetUserId) {
      return { status: "error", message: t("noTarget") };
    }

    const { error: grantError } = await supabase.rpc(
      "grant_editorial_membership",
      {
        p_profile_id: targetUserId,
        p_role: roleValue,
        p_invited: invited,
      },
    );

    if (grantError) {
      if (grantError.code === "23505") {
        return {
          status: "error",
          message: tAll("adminMembers.errors.alreadyMember"),
        };
      }

      await supabase.rpc("record_editorial_audit", {
        p_action: "member.invite_failed",
        p_target_profile_id: targetUserId,
        p_details: { reason: grantError.code ?? "grant_failed" },
      });

      return {
        status: "error",
        message: t("grantFailed"),
      };
    }

    revalidateLocalizedPath("/admin/members");
    revalidateLocalizedPath("/admin", "layout");

    return {
      status: "success",
      message: invited ? t("invited") : t("granted"),
    };
  } catch {
    return {
      status: "error",
      message: t("unexpected"),
    };
  }
}

async function updateMemberRole(formData: FormData) {
  const profileId = formData.get("profileId");
  const role = formData.get("role");

  if (typeof profileId !== "string" || !profileId) {
    return { error: "invalid" };
  }

  if (!isEditorialRole(role)) {
    return { error: "invalid" };
  }

  const context = await getEditorialContext();

  if (!context.user) return { error: "session" };
  if (context.membership?.role !== "admin") return { error: "forbidden" };
  if (profileId === context.user.id) return { error: "self" };

  const supabase = await createServerSupabaseClient();
  const { error } = await supabase.rpc("change_editorial_role", {
    p_profile_id: profileId,
    p_role: role,
  });

  if (error) return { error: mapMembershipRpcError(error) };

  return { error: null };
}

export async function updateMemberRoleAction(formData: FormData) {
  const result = await updateMemberRole(formData);

  if (result.error) {
    redirect(`/admin/members?error=${result.error}`);
  }

  revalidateLocalizedPath("/admin/members");
  revalidateLocalizedPath("/admin", "layout");
  redirect("/admin/members?status=role-updated");
}

async function setMemberActive(formData: FormData) {
  const profileId = formData.get("profileId");
  const active = formData.get("active");

  if (typeof profileId !== "string" || !profileId) {
    return { error: "invalid" };
  }

  if (active !== "true" && active !== "false") {
    return { error: "invalid" };
  }

  const context = await getEditorialContext();

  if (!context.user) return { error: "session" };
  if (context.membership?.role !== "admin") return { error: "forbidden" };
  if (profileId === context.user.id) return { error: "self" };

  const supabase = await createServerSupabaseClient();
  const { error } = await supabase.rpc("set_editorial_active", {
    p_profile_id: profileId,
    p_active: active === "true",
  });

  if (error) return { error: mapMembershipRpcError(error) };

  return { error: null };
}

export async function setMemberActiveAction(formData: FormData) {
  const result = await setMemberActive(formData);

  if (result.error) {
    redirect(`/admin/members?error=${result.error}`);
  }

  revalidateLocalizedPath("/admin/members");
  revalidateLocalizedPath("/admin", "layout");
  redirect("/admin/members?status=membership-updated");
}
