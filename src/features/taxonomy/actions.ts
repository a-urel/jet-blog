"use server";

import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";

import { isUuid } from "@/features/posts/admin/validation";
import { invalidatePublicContent } from "@/features/posts/invalidate";
import { canManageTaxonomy, getEditorialContext } from "@/lib/auth/editorial";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import {
  validateCategoryInput,
  validateTagInput,
  type TaxonomyFieldErrors,
  type TaxonomyFieldIssues,
} from "./validation";
import { revalidateLocalizedPath } from "@/lib/revalidate";

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

async function validationErrors(issues: TaxonomyFieldIssues): Promise<TaxonomyFieldErrors> {
  const t = await getTranslations("adminTaxonomy.validation");
  const errors: TaxonomyFieldErrors = {};
  for (const [field, issue] of Object.entries(issues) as [
    keyof TaxonomyFieldIssues,
    NonNullable<TaxonomyFieldIssues[keyof TaxonomyFieldIssues]>,
  ][]) {
    errors[field] = t(issue.key, issue.values);
  }
  return errors;
}

async function invalidFormState(
  formData: FormData,
  issues: TaxonomyFieldIssues,
): Promise<TaxonomyFormState> {
  const t = await getTranslations("admin.actions");
  return errorState(formData, t("fixErrors"), await validationErrors(issues));
}

// The RPCs re-check admin membership; this check only gives a clear message
// and avoids a database round trip for everyone else.
async function requireTaxonomyAdmin(): Promise<string | null> {
  const [{ user, membership }, t] = await Promise.all([
    getEditorialContext(),
    getTranslations(),
  ]);
  if (!user) return t("admin.actions.sessionMissing");
  if (!canManageTaxonomy(membership)) return t("adminTaxonomy.errors.forbidden");
  return null;
}

type RpcError = { code?: string; message?: string } | null;

async function mapRpcError(
  kind: Kind,
  error: RpcError,
): Promise<{ message: string; fieldErrors?: TaxonomyFieldErrors }> {
  const message = error?.message ?? "";
  const [t, tActions, tValidation] = await Promise.all([
    getTranslations("adminTaxonomy.errors"),
    getTranslations("admin.actions"),
    getTranslations("adminTaxonomy.validation"),
  ]);

  switch (error?.code) {
    case "42501":
      return { message: t("forbidden") };
    case "PT429":
      return { message: tActions("rateLimited") };
    case "40001":
      return { message: t("stale", { kind }) };
    case "P0002":
      return { message: t("missing", { kind }) };
    case "23505":
      if (message.includes("name_key")) {
        return { message: t("nameTaken"), fieldErrors: { name: t("nameTaken") } };
      }
      return { message: t("slugTaken"), fieldErrors: { slug: t("slugTaken") } };
    case "23514":
      if (message.includes("cycle") || message.includes("own parent") || message.includes("parent_not_self")) {
        return { message: t("cycle"), fieldErrors: { parentId: t("cycleField") } };
      }
      if (message.includes("deeper")) {
        return { message: t("tooDeep"), fieldErrors: { parentId: t("tooDeepField") } };
      }
      return { message: tActions("invalidInput") };
    case "22023":
      if (message.includes("parent")) {
        return {
          message: tValidation("parentInvalid"),
          fieldErrors: { parentId: tValidation("parentInvalid") },
        };
      }
      if (message.includes("Target category required")) {
        return { message: t("targetRequired") };
      }
      if (message.includes("target")) {
        return { message: t("targetInvalid") };
      }
      return { message: tActions("invalidInput") };
    default:
      return { message: tActions("failed") };
  }
}

async function invalidRequest() {
  const t = await getTranslations("admin.actions");
  return t("invalidRequest");
}

async function deleteNotConfirmed() {
  const t = await getTranslations("admin.actions");
  return t("confirmDelete");
}

function afterChange(kind: Kind, id?: string) {
  invalidatePublicContent("taxonomy-changed");
  revalidateLocalizedPath(listPaths[kind]);
  if (id) revalidateLocalizedPath(`${listPaths[kind]}/${id}`);
  // Post forms list categories and tags.
  revalidateLocalizedPath("/admin/posts", "layout");
}

export async function createCategoryAction(
  _previousState: TaxonomyFormState,
  formData: FormData,
): Promise<TaxonomyFormState> {
  const denied = await requireTaxonomyAdmin();
  if (denied) return errorState(formData, denied);

  const input = validateCategoryInput(submittedValues(formData));
  if (!input.ok) return invalidFormState(formData, input.fieldErrors);

  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase.rpc("create_category", {
    p_name: input.data.name,
    p_slug: input.data.slug,
    p_description: input.data.description,
    p_parent_id: input.data.parentId,
    p_sort_order: input.data.sortOrder,
  });

  if (error) {
    const mapped = await mapRpcError("category", error);
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
    return errorState(formData, await invalidRequest());
  }

  const input = validateCategoryInput(submittedValues(formData));
  if (!input.ok) return invalidFormState(formData, input.fieldErrors);

  if (input.data.parentId === categoryId) {
    const t = await getTranslations("adminTaxonomy.errors");
    return errorState(formData, t("selfParent"), { parentId: t("cycleField") });
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
    const mapped = await mapRpcError("category", error);
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

  if (!isUuid(categoryId) || !updatedAt) return { error: await invalidRequest() };
  if (formData.get("confirmDelete") !== "on") return { error: await deleteNotConfirmed() };
  if (targetValue && !isUuid(targetValue)) {
    const t = await getTranslations("adminTaxonomy.errors");
    return { error: t("targetInvalid") };
  }

  const supabase = await createServerSupabaseClient();
  const { error } = await supabase.rpc("delete_category", {
    p_category_id: categoryId,
    p_expected_updated_at: updatedAt,
    p_target_category_id: targetValue || null,
  });

  if (error) return { error: (await mapRpcError("category", error)).message };

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
  if (!input.ok) return invalidFormState(formData, input.fieldErrors);

  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase.rpc("create_tag", {
    p_name: input.data.name,
    p_slug: input.data.slug,
    p_description: input.data.description,
  });

  if (error) {
    const mapped = await mapRpcError("tag", error);
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
  if (!isUuid(tagId) || !updatedAt) return errorState(formData, await invalidRequest());

  const input = validateTagInput(submittedValues(formData));
  if (!input.ok) return invalidFormState(formData, input.fieldErrors);

  const supabase = await createServerSupabaseClient();
  const { error } = await supabase.rpc("update_tag", {
    p_tag_id: tagId,
    p_expected_updated_at: updatedAt,
    p_name: input.data.name,
    p_slug: input.data.slug,
    p_description: input.data.description,
  });

  if (error) {
    const mapped = await mapRpcError("tag", error);
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
  if (!isUuid(tagId) || !updatedAt) return { error: await invalidRequest() };
  if (formData.get("confirmDelete") !== "on") return { error: await deleteNotConfirmed() };

  const supabase = await createServerSupabaseClient();
  const { error } = await supabase.rpc("delete_tag", {
    p_tag_id: tagId,
    p_expected_updated_at: updatedAt,
  });

  if (error) return { error: (await mapRpcError("tag", error)).message };

  afterChange("tag", tagId);
  redirect("/admin/tags?status=deleted");
}
