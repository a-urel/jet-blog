"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { isUuid } from "@/features/posts/admin/validation";
import { invalidatePublicContent } from "@/features/posts/invalidate";
import { canManageAuthors, getEditorialContext } from "@/lib/auth/editorial";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { validateAuthorInput, type AuthorFieldErrors } from "./validation";

export type AuthorFormValues = {
  name: string;
  slug: string;
  bio: string;
  profileId: string;
};

export type AuthorFormState = {
  status: "idle" | "error";
  message: string | null;
  fieldErrors: AuthorFieldErrors;
  // Submitted values become the next defaults, because React resets
  // uncontrolled fields after a form action settles.
  values?: AuthorFormValues;
};

export type AuthorDeleteState = {
  error: string | null;
};

function getString(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value : "";
}

function submittedValues(formData: FormData): AuthorFormValues {
  return {
    name: getString(formData, "name"),
    slug: getString(formData, "slug"),
    bio: getString(formData, "bio"),
    profileId: getString(formData, "profileId"),
  };
}

function errorState(
  formData: FormData,
  message: string,
  fieldErrors: AuthorFieldErrors = {},
): AuthorFormState {
  return { status: "error", message, fieldErrors, values: submittedValues(formData) };
}

// The RPCs re-check admin membership; this check only gives a clear message
// and avoids a database round trip for everyone else.
async function requireAuthorAdmin(): Promise<string | null> {
  const { user, membership } = await getEditorialContext();
  if (!user) return "Oturum bulunamadı. Yeniden giriş yapın.";
  if (!canManageAuthors(membership)) return "Yazar yönetimi için admin yetkisi gerekir.";
  return null;
}

type RpcError = { code?: string; message?: string } | null;

function mapRpcError(error: RpcError): { message: string; fieldErrors?: AuthorFieldErrors } {
  const message = error?.message ?? "";

  switch (error?.code) {
    case "42501":
      return { message: "Yazar yönetimi için admin yetkisi gerekir." };
    case "PT429":
      return {
        message:
          "Kısa sürede çok fazla değişiklik yapıldı. Formdaki bilgiler korundu; birkaç dakika sonra tekrar deneyin.",
      };
    case "40001":
      return {
        message:
          "Yazar siz sayfayı açtıktan sonra değişti. Sayfayı yenileyip değişikliği yeniden uygulayın.",
      };
    case "P0002":
      return { message: "Yazar bulunamadı." };
    case "23505":
      if (message.includes("user_id")) {
        return {
          message: "Bu hesap zaten başka bir yazara bağlı.",
          fieldErrors: { profileId: "Bu hesap zaten başka bir yazara bağlı." },
        };
      }
      return {
        message: "Bu slug zaten kullanılıyor veya eski bir adresin yönlendirmesi.",
        fieldErrors: { slug: "Bu slug zaten kullanılıyor veya eski bir adresin yönlendirmesi." },
      };
    case "22023":
      return {
        message: "Yalnızca aktif bir editoryal üyenin hesabı bağlanabilir.",
        fieldErrors: { profileId: "Aktif bir editoryal üye seçin." },
      };
    case "23503":
      return {
        message:
          "Bu yazar yazılarda kredilendirilmiş. Silmeden önce yazı düzenleyicide kredilerini kaldırın.",
      };
    case "23514":
      return { message: "Gönderilen bilgiler geçersiz." };
    default:
      return { message: "İşlem tamamlanamadı. Tekrar deneyin." };
  }
}

function afterChange(id?: string) {
  invalidatePublicContent("author-changed");
  revalidatePath("/admin/authors");
  if (id) revalidatePath(`/admin/authors/${id}`);
  // Post forms list authors for credits.
  revalidatePath("/admin/posts", "layout");
}

export async function createAuthorAction(
  _previousState: AuthorFormState,
  formData: FormData,
): Promise<AuthorFormState> {
  const denied = await requireAuthorAdmin();
  if (denied) return errorState(formData, denied);

  const input = validateAuthorInput(submittedValues(formData));
  if (!input.ok) {
    return errorState(formData, "Formdaki hataları düzeltin.", input.fieldErrors);
  }

  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase.rpc("create_author", {
    p_name: input.data.name,
    p_slug: input.data.slug,
    p_bio: input.data.bio,
    p_profile_id: input.data.profileId,
  });

  if (error) {
    const mapped = mapRpcError(error);
    return errorState(formData, mapped.message, mapped.fieldErrors);
  }

  afterChange(typeof data === "string" ? data : undefined);
  redirect("/admin/authors?status=created");
}

export async function updateAuthorAction(
  _previousState: AuthorFormState,
  formData: FormData,
): Promise<AuthorFormState> {
  const denied = await requireAuthorAdmin();
  if (denied) return errorState(formData, denied);

  const authorId = getString(formData, "id");
  const updatedAt = getString(formData, "updatedAt");
  if (!isUuid(authorId) || !updatedAt) return errorState(formData, "Geçersiz istek.");

  const input = validateAuthorInput(submittedValues(formData));
  if (!input.ok) {
    return errorState(formData, "Formdaki hataları düzeltin.", input.fieldErrors);
  }

  const supabase = await createServerSupabaseClient();
  const { error } = await supabase.rpc("update_author", {
    p_author_id: authorId,
    p_expected_updated_at: updatedAt,
    p_name: input.data.name,
    p_slug: input.data.slug,
    p_bio: input.data.bio,
    p_profile_id: input.data.profileId,
  });

  if (error) {
    const mapped = mapRpcError(error);
    return errorState(formData, mapped.message, mapped.fieldErrors);
  }

  afterChange(authorId);
  redirect("/admin/authors?status=updated");
}

export async function deleteAuthorAction(
  _previousState: AuthorDeleteState,
  formData: FormData,
): Promise<AuthorDeleteState> {
  const denied = await requireAuthorAdmin();
  if (denied) return { error: denied };

  const authorId = getString(formData, "id");
  const updatedAt = getString(formData, "updatedAt");
  if (!isUuid(authorId) || !updatedAt) return { error: "Geçersiz istek." };
  if (formData.get("confirmDelete") !== "on") {
    return { error: "Silme işlemini onaylamak için kutuyu işaretleyin." };
  }

  const supabase = await createServerSupabaseClient();
  const { error } = await supabase.rpc("delete_author", {
    p_author_id: authorId,
    p_expected_updated_at: updatedAt,
  });

  if (error) return { error: mapRpcError(error).message };

  afterChange(authorId);
  redirect("/admin/authors?status=deleted");
}
