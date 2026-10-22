"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { redirect } from "next/navigation";

import {
  getEditorialContext,
  isEditorialRole,
} from "@/lib/auth/editorial";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { createServerSupabaseClient } from "@/lib/supabase/server";

const inviteRateLimitWindowMs = 60 * 60 * 1000;
const inviteRateLimitMax = 20;
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

async function getAppOrigin() {
  const configuredSiteUrl = process.env.NEXT_PUBLIC_SITE_URL?.trim();

  if (configuredSiteUrl) {
    try {
      const parsed = new URL(configuredSiteUrl);
      if (parsed.protocol === "http:" || parsed.protocol === "https:") {
        return parsed.origin;
      }
    } catch {
      // Fall through to the request origin when the public site URL is invalid.
    }
  }

  const headerStore = await headers();
  const origin = headerStore.get("origin");

  if (origin) {
    const parsed = new URL(origin);
    if (parsed.protocol === "http:" || parsed.protocol === "https:") {
      return parsed.origin;
    }
  }

  const forwardedHost =
    headerStore.get("x-forwarded-host") ?? headerStore.get("host");
  const forwardedProto = headerStore.get("x-forwarded-proto") ?? "http";

  if (forwardedHost) {
    return `${forwardedProto}://${forwardedHost}`;
  }

  throw new Error("Could not determine the application origin.");
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
  const context = await getEditorialContext();

  if (!context.user) {
    return { status: "error", message: "Oturum bulunamadı. Yeniden giriş yapın." };
  }

  if (context.membership?.role !== "admin") {
    return { status: "error", message: "Bu işlem için admin yetkisi gerekir." };
  }

  const emailValue = formData.get("email");
  const roleValue = formData.get("role");
  const displayNameValue = formData.get("displayName");
  const confirmAdmin = formData.get("confirmAdmin");

  if (typeof emailValue !== "string") {
    return { status: "error", message: "E-posta gerekli." };
  }

  const email = emailValue.trim().toLowerCase();

  if (!isValidEmail(email)) {
    return { status: "error", message: "Geçerli bir e-posta girin." };
  }

  if (!isEditorialRole(roleValue)) {
    return { status: "error", message: "Geçerli bir rol seçin." };
  }

  if (roleValue === "admin" && confirmAdmin !== "on") {
    return {
      status: "error",
      message: "Admin rolü vermek için onay kutusunu işaretleyin.",
    };
  }

  const displayName =
    typeof displayNameValue === "string" ? displayNameValue.trim() : "";

  if (displayName.length > 120) {
    return {
      status: "error",
      message: "Görünen ad 120 karakteri aşamaz.",
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
      message: "İşlem şu anda doğrulanamadı. Tekrar deneyin.",
    };
  }

  if ((count ?? 0) >= inviteRateLimitMax) {
    return {
      status: "error",
      message: "Saatlik davet sınırına ulaşıldı. Daha sonra tekrar deneyin.",
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
          message: "Davet gönderilemedi. Supabase ayarlarını kontrol edin.",
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
          message: "Bu e-posta kayıtlı görünüyor ancak kullanıcı bulunamadı.",
        };
      }

      targetUserId = existingUser.id;
    } else {
      targetUserId = inviteData.user.id;
      invited = true;
    }

    if (!targetUserId) {
      return { status: "error", message: "Davet hedefi belirlenemedi." };
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
          message: "Bu kullanıcı zaten aktif bir üye.",
        };
      }

      await supabase.rpc("record_editorial_audit", {
        p_action: "member.invite_failed",
        p_target_profile_id: targetUserId,
        p_details: { reason: grantError.code ?? "grant_failed" },
      });

      return {
        status: "error",
        message:
          "Davet işlendi ancak üyelik kaydı tamamlanamadı. Üye listesini kontrol edin.",
      };
    }

    revalidatePath("/admin/uyeler");
    revalidatePath("/admin", "layout");

    return {
      status: "success",
      message: invited
        ? "Davet e-postası gönderildi."
        : "Mevcut kullanıcıya rol verildi.",
    };
  } catch {
    return {
      status: "error",
      message: "Beklenmeyen bir hata oluştu. Tekrar deneyin.",
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
    redirect(`/admin/uyeler?hata=${result.error}`);
  }

  revalidatePath("/admin/uyeler");
  revalidatePath("/admin", "layout");
  redirect("/admin/uyeler?durum=rol-guncellendi");
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
    redirect(`/admin/uyeler?hata=${result.error}`);
  }

  revalidatePath("/admin/uyeler");
  revalidatePath("/admin", "layout");
  redirect("/admin/uyeler?durum=uyelik-guncellendi");
}
