"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { isUuid } from "@/features/posts/admin/validation";
import { invalidatePublicContent } from "@/features/posts/invalidate";
import { canManageTaxonomy, getEditorialContext } from "@/lib/auth/editorial";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import {
  validateCategoryInput,
  validateTagInput,
  type TaxonomyFieldErrors,
} from "./validation";

export type TaxonomyFormValues = {
  name: string;
  slug: string;
  description: string;
  parentId: string;
  sortOrder: string;
};

export type TaxonomyFormState = {
  status: "idle" | "error";
  message: string | null;
  fieldErrors: TaxonomyFieldErrors;
  // Submitted values become the next defaults, because React resets
  // uncontrolled fields after a form action settles.
  values?: TaxonomyFormValues;
};

export type TaxonomyDeleteState = {
  error: string | null;
};

type Kind = "category" | "tag";

const listPaths: Record<Kind, string> = {
  category: "/admin/categories",
  tag: "/admin/tags",
};

function getString(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value : "";
}

function submittedValues(formData: FormData): TaxonomyFormValues {
  return {
    name: getString(formData, "name"),
    slug: getString(formData, "slug"),
    description: getString(formData, "description"),
    parentId: getString(formData, "parentId"),
    sortOrder: getString(formData, "sortOrder"),
  };
}

function errorState(
  formData: FormData,
  message: string,
  fieldErrors: TaxonomyFieldErrors = {},
): TaxonomyFormState {
  return { status: "error", message, fieldErrors, values: submittedValues(formData) };
}

// The RPCs re-check admin membership; this check only gives a clear message
// and avoids a database round trip for everyone else.
async function requireTaxonomyAdmin(): Promise<string | null> {
  const { user, membership } = await getEditorialContext();
  if (!user) return "Oturum bulunamadı. Yeniden giriş yapın.";
  if (!canManageTaxonomy(membership)) {
    return "Kategori ve etiket yönetimi için admin yetkisi gerekir.";
  }
  return null;
}

type RpcError = { code?: string; message?: string } | null;

function mapRpcError(kind: Kind, error: RpcError): {
  message: string;
  fieldErrors?: TaxonomyFieldErrors;
} {
  const message = error?.message ?? "";
  const subject = kind === "category" ? "Kategori" : "Etiket";

  switch (error?.code) {
    case "42501":
      return { message: "Kategori ve etiket yönetimi için admin yetkisi gerekir." };
    case "PT429":
      return {
        message:
          "Kısa sürede çok fazla değişiklik yapıldı. Formdaki bilgiler korundu; birkaç dakika sonra tekrar deneyin.",
      };
    case "40001":
      return {
        message: `${subject} siz sayfayı açtıktan sonra değişti. Sayfayı yenileyip değişikliği yeniden uygulayın.`,
      };
    case "P0002":
      return { message: `${subject} bulunamadı.` };
    case "23505":
      if (message.includes("name_key")) {
        return {
          message: "Bu ad zaten kullanılıyor.",
          fieldErrors: { name: "Bu ad zaten kullanılıyor." },
        };
      }
      return {
        message: "Bu slug zaten kullanılıyor veya eski bir adresin yönlendirmesi.",
        fieldErrors: { slug: "Bu slug zaten kullanılıyor veya eski bir adresin yönlendirmesi." },
      };
    case "23514":
      if (message.includes("cycle") || message.includes("own parent") || message.includes("parent_not_self")) {
        return {
          message: "Kategori kendi altına veya alt kategorilerinden birine taşınamaz.",
          fieldErrors: { parentId: "Kendisi veya alt kategorisi üst kategori olamaz." },
        };
      }
      if (message.includes("deeper")) {
        return {
          message: "Kategori ağacı 100 seviyeden derin olamaz.",
          fieldErrors: { parentId: "Kategori ağacı çok derin." },
        };
      }
      return { message: "Gönderilen bilgiler geçersiz." };
    case "22023":
      if (message.includes("parent")) {
        return {
          message: "Geçerli bir üst kategori seçin.",
          fieldErrors: { parentId: "Geçerli bir üst kategori seçin." },
        };
      }
      if (message.includes("Target category required")) {
        return { message: "Bu kategoriyi kullanan yazılar var; taşınacak kategoriyi seçin." };
      }
      if (message.includes("target")) {
        return { message: "Geçerli bir hedef kategori seçin." };
      }
      return { message: "Gönderilen bilgiler geçersiz." };
    default:
      return { message: "İşlem tamamlanamadı. Tekrar deneyin." };
  }
}

function afterChange(kind: Kind, id?: string) {
  invalidatePublicContent("taxonomy-changed");
  revalidatePath(listPaths[kind]);
  if (id) revalidatePath(`${listPaths[kind]}/${id}`);
  // Post forms list categories and tags.
  revalidatePath("/admin/posts", "layout");
}

export async function createCategoryAction(
  _previousState: TaxonomyFormState,
  formData: FormData,
): Promise<TaxonomyFormState> {
  const denied = await requireTaxonomyAdmin();
  if (denied) return errorState(formData, denied);

  const input = validateCategoryInput(submittedValues(formData));
  if (!input.ok) {
    return errorState(formData, "Formdaki hataları düzeltin.", input.fieldErrors);
  }

  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase.rpc("create_category", {
    p_name: input.data.name,
    p_slug: input.data.slug,
    p_description: input.data.description,
    p_parent_id: input.data.parentId,
    p_sort_order: input.data.sortOrder,
  });

  if (error) {
    const mapped = mapRpcError("category", error);
    return errorState(formData, mapped.message, mapped.fieldErrors);
  }

  afterChange("category", typeof data === "string" ? data : undefined);
  redirect("/admin/categories?status=created");
}

export async function updateCategoryAction(
  _previousState: TaxonomyFormState,
  formData: FormData,
): Promise<TaxonomyFormState> {
  const denied = await requireTaxonomyAdmin();
  if (denied) return errorState(formData, denied);

  const categoryId = getString(formData, "id");
  const updatedAt = getString(formData, "updatedAt");
  if (!isUuid(categoryId) || !updatedAt) {
    return errorState(formData, "Geçersiz istek.");
  }

  const input = validateCategoryInput(submittedValues(formData));
  if (!input.ok) {
    return errorState(formData, "Formdaki hataları düzeltin.", input.fieldErrors);
  }

  if (input.data.parentId === categoryId) {
    return errorState(formData, "Kategori kendi altına taşınamaz.", {
      parentId: "Kendisi veya alt kategorisi üst kategori olamaz.",
    });
  }

  const supabase = await createServerSupabaseClient();
  const { error } = await supabase.rpc("update_category", {
    p_category_id: categoryId,
    p_expected_updated_at: updatedAt,
    p_name: input.data.name,
    p_slug: input.data.slug,
    p_description: input.data.description,
    p_parent_id: input.data.parentId,
    p_sort_order: input.data.sortOrder,
  });

  if (error) {
    const mapped = mapRpcError("category", error);
    return errorState(formData, mapped.message, mapped.fieldErrors);
  }

  afterChange("category", categoryId);
  redirect("/admin/categories?status=updated");
}

export async function deleteCategoryAction(
  _previousState: TaxonomyDeleteState,
  formData: FormData,
): Promise<TaxonomyDeleteState> {
  const denied = await requireTaxonomyAdmin();
  if (denied) return { error: denied };

  const categoryId = getString(formData, "id");
  const updatedAt = getString(formData, "updatedAt");
  const targetValue = getString(formData, "targetCategoryId").trim();

  if (!isUuid(categoryId) || !updatedAt) return { error: "Geçersiz istek." };
  if (formData.get("confirmDelete") !== "on") {
    return { error: "Silme işlemini onaylamak için kutuyu işaretleyin." };
  }
  if (targetValue && !isUuid(targetValue)) {
    return { error: "Geçerli bir hedef kategori seçin." };
  }

  const supabase = await createServerSupabaseClient();
  const { error } = await supabase.rpc("delete_category", {
    p_category_id: categoryId,
    p_expected_updated_at: updatedAt,
    p_target_category_id: targetValue || null,
  });

  if (error) return { error: mapRpcError("category", error).message };

  afterChange("category", categoryId);
  redirect("/admin/categories?status=deleted");
}

export async function createTagAction(
  _previousState: TaxonomyFormState,
  formData: FormData,
): Promise<TaxonomyFormState> {
  const denied = await requireTaxonomyAdmin();
  if (denied) return errorState(formData, denied);

  const input = validateTagInput(submittedValues(formData));
  if (!input.ok) {
    return errorState(formData, "Formdaki hataları düzeltin.", input.fieldErrors);
  }

  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase.rpc("create_tag", {
    p_name: input.data.name,
    p_slug: input.data.slug,
    p_description: input.data.description,
  });

  if (error) {
    const mapped = mapRpcError("tag", error);
    return errorState(formData, mapped.message, mapped.fieldErrors);
  }

  afterChange("tag", typeof data === "string" ? data : undefined);
  redirect("/admin/tags?status=created");
}

export async function updateTagAction(
  _previousState: TaxonomyFormState,
  formData: FormData,
): Promise<TaxonomyFormState> {
  const denied = await requireTaxonomyAdmin();
  if (denied) return errorState(formData, denied);

  const tagId = getString(formData, "id");
  const updatedAt = getString(formData, "updatedAt");
  if (!isUuid(tagId) || !updatedAt) return errorState(formData, "Geçersiz istek.");

  const input = validateTagInput(submittedValues(formData));
  if (!input.ok) {
    return errorState(formData, "Formdaki hataları düzeltin.", input.fieldErrors);
  }

  const supabase = await createServerSupabaseClient();
  const { error } = await supabase.rpc("update_tag", {
    p_tag_id: tagId,
    p_expected_updated_at: updatedAt,
    p_name: input.data.name,
    p_slug: input.data.slug,
    p_description: input.data.description,
  });

  if (error) {
    const mapped = mapRpcError("tag", error);
    return errorState(formData, mapped.message, mapped.fieldErrors);
  }

  afterChange("tag", tagId);
  redirect("/admin/tags?status=updated");
}

export async function deleteTagAction(
  _previousState: TaxonomyDeleteState,
  formData: FormData,
): Promise<TaxonomyDeleteState> {
  const denied = await requireTaxonomyAdmin();
  if (denied) return { error: denied };

  const tagId = getString(formData, "id");
  const updatedAt = getString(formData, "updatedAt");
  if (!isUuid(tagId) || !updatedAt) return { error: "Geçersiz istek." };
  if (formData.get("confirmDelete") !== "on") {
    return { error: "Silme işlemini onaylamak için kutuyu işaretleyin." };
  }

  const supabase = await createServerSupabaseClient();
  const { error } = await supabase.rpc("delete_tag", {
    p_tag_id: tagId,
    p_expected_updated_at: updatedAt,
  });

  if (error) return { error: mapRpcError("tag", error).message };

  afterChange("tag", tagId);
  redirect("/admin/tags?status=deleted");
}
