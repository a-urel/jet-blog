"use server";

import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";

import { currentContentVersion, parseSubmittedBody } from "@/features/posts/content/schema";
import { getStringField, isUuid } from "@/features/posts/admin/validation";
import { getEditorialContext } from "@/lib/auth/editorial";
import { revalidateLocalizedPath } from "@/lib/revalidate";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { invalidatePageContent } from "../invalidate";
import {
  isNavigationLocation,
  validateNavigationItems,
  type NavigationItemError,
  type NavigationItemInput,
} from "../navigation";
import { canManagePages } from "../permissions";
import { validatePageFields, type PageField, type PageValidationError } from "../validation";
import { pageActionErrorKey } from "./errors";

// Page and menu mutations (Phase 28). Every write is a security-definer RPC
// that repeats the role check (require_page_editor) and the revision
// compare-and-swap; the checks here only give earlier, translated errors.
// Cache effects: src/features/pages/cache.ts.

type Translator = Awaited<ReturnType<typeof getTranslations<"adminPages">>>;

export type SubmittedPageValues = {
  title: string;
  slug: string;
  metaDescription: string;
  kind: string;
};

export type PageFormState = {
  status: "idle" | "error" | "conflict";
  message: string | null;
  fieldErrors: Partial<Record<PageField, string>>;
  values?: SubmittedPageValues;
};

function errorState(
  message: string,
  fieldErrors: PageFormState["fieldErrors"] = {},
): PageFormState {
  return { status: "error", message, fieldErrors };
}

function readValues(formData: FormData): SubmittedPageValues {
  return {
    title: getStringField(formData, "title"),
    slug: getStringField(formData, "slug"),
    metaDescription: getStringField(formData, "metaDescription"),
    kind: getStringField(formData, "kind"),
  };
}

function readPageInput(t: Translator, formData: FormData) {
  const fields = validatePageFields(readValues(formData));
  const body = parseSubmittedBody(getStringField(formData, "body"));
  const fieldErrors: PageFormState["fieldErrors"] = {};

  if (!fields.ok) {
    for (const [field, key] of Object.entries(fields.fieldErrors) as [
      PageField,
      PageValidationError,
    ][]) {
      fieldErrors[field] = t(`validation.${key}`);
    }
  }

  if (!body.ok) fieldErrors.body = t("actionErrors.bodyUnsupported");

  if (!fields.ok || !body.ok) return { ok: false as const, fieldErrors };

  return { ok: true as const, data: fields.data, body: body.doc };
}

function mapRpcError(
  t: Translator,
  error: { code?: string; message?: string } | null,
): PageFormState {
  const key = pageActionErrorKey(error);
  const message = t(`errors.${key}`);

  switch (key) {
    case "conflict":
      return { status: "conflict", message, fieldErrors: {} };
    case "slug":
    case "kind":
    case "title":
    case "metaDescription":
      return errorState(message, { [key]: message });
    case "body":
      return errorState(message, { body: t("actionErrors.bodyInvalidField") });
    default:
      return errorState(message);
  }
}

function revalidateAdminPages(pageId?: string) {
  revalidateLocalizedPath("/admin/pages");
  if (pageId) revalidateLocalizedPath(`/admin/pages/${pageId}`);
  revalidateLocalizedPath("/admin/navigation");
}

async function requirePageManager(t: Translator): Promise<PageFormState | null> {
  const context = await getEditorialContext();
  if (!context.user) return errorState(t("actionErrors.noSession"));
  if (!canManagePages(context.membership)) return errorState(t("errors.forbidden"));
  return null;
}

// Success redirects (redirect() throws), so only rejected saves return state.
export async function createPageAction(
  _previousState: PageFormState,
  formData: FormData,
): Promise<PageFormState> {
  return { ...(await createPage(formData)), values: readValues(formData) };
}

export async function updatePageAction(
  _previousState: PageFormState,
  formData: FormData,
): Promise<PageFormState> {
  return { ...(await updatePage(formData)), values: readValues(formData) };
}

async function createPage(formData: FormData): Promise<PageFormState> {
  const t = await getTranslations("adminPages");
  const denied = await requirePageManager(t);
  if (denied) return denied;

  const input = readPageInput(t, formData);
  if (!input.ok) return errorState(t("actionErrors.formInvalid"), input.fieldErrors);

  const { data, error } = await (await createServerSupabaseClient()).rpc("create_page", {
    p_title: input.data.title,
    p_slug: input.data.slug,
    p_meta_description: input.data.metaDescription,
    p_kind: input.data.kind,
    p_body: input.body,
    p_content_version: currentContentVersion,
  });

  if (error) return mapRpcError(t, error);

  const row = (data as { page_id: string }[] | null)?.[0];
  if (!row?.page_id) return errorState(t("errors.failed"));

  revalidateAdminPages(row.page_id);
  invalidatePageContent("draft-page-saved");
  redirect(`/admin/pages/${row.page_id}?status=created`);
}

async function updatePage(formData: FormData): Promise<PageFormState> {
  const t = await getTranslations("adminPages");
  const denied = await requirePageManager(t);
  if (denied) return denied;

  const pageId = getStringField(formData, "pageId").trim();
  const expectedRevision = Number.parseInt(getStringField(formData, "revision").trim(), 10);

  if (!isUuid(pageId)) return errorState(t("errors.missing"));
  if (!Number.isSafeInteger(expectedRevision) || expectedRevision < 1) {
    return { status: "conflict", message: t("errors.conflict"), fieldErrors: {} };
  }

  const input = readPageInput(t, formData);
  if (!input.ok) return errorState(t("actionErrors.formInvalid"), input.fieldErrors);

  const { data, error } = await (await createServerSupabaseClient()).rpc("update_page", {
    p_page_id: pageId,
    p_expected_revision: expectedRevision,
    p_title: input.data.title,
    p_slug: input.data.slug,
    p_meta_description: input.data.metaDescription,
    p_kind: input.data.kind,
    p_body: input.body,
    p_content_version: currentContentVersion,
  });

  if (error) return mapRpcError(t, error);

  const row = (data as { status: string }[] | null)?.[0];

  revalidateAdminPages(pageId);
  // Pages keep one copy: saving a published page changes the public page.
  invalidatePageContent(row?.status === "published" ? "published-page-saved" : "draft-page-saved");
  redirect(`/admin/pages/${pageId}?status=updated`);
}

type PageStateRpc = "publish_page" | "unpublish_page" | "delete_page";

const stateOutcomes = {
  publish_page: { change: "page-published", status: "published" },
  unpublish_page: { change: "page-unpublished", status: "unpublished" },
  // Only drafts can be deleted, so a delete has no public effect.
  delete_page: { change: "draft-page-saved", status: "deleted" },
} as const satisfies Record<PageStateRpc, { change: string; status: string }>;

async function changePageState(formData: FormData, rpc: PageStateRpc): Promise<never> {
  const pageId = getStringField(formData, "pageId").trim();
  const expectedRevision = Number.parseInt(getStringField(formData, "revision").trim(), 10);

  if (!isUuid(pageId)) redirect("/admin/pages");

  const pagePath = `/admin/pages/${pageId}`;
  const context = await getEditorialContext();

  if (!context.user) redirect("/login");
  if (!canManagePages(context.membership)) redirect(`${pagePath}?error=forbidden`);
  if (!Number.isSafeInteger(expectedRevision) || expectedRevision < 1) {
    redirect(`${pagePath}?error=conflict`);
  }

  const { error } = await (await createServerSupabaseClient()).rpc(rpc, {
    p_page_id: pageId,
    p_expected_revision: expectedRevision,
  });

  if (error) redirect(`${pagePath}?error=${pageActionErrorKey(error)}`);

  const outcome = stateOutcomes[rpc];
  revalidateAdminPages(pageId);
  invalidatePageContent(outcome.change);

  if (rpc === "delete_page") redirect("/admin/pages?status=deleted");
  redirect(`${pagePath}?status=${outcome.status}`);
}

export async function publishPageAction(formData: FormData): Promise<void> {
  await changePageState(formData, "publish_page");
}

export async function unpublishPageAction(formData: FormData): Promise<void> {
  await changePageState(formData, "unpublish_page");
}

export async function deletePageAction(formData: FormData): Promise<void> {
  await changePageState(formData, "delete_page");
}

export type NavigationFormState = {
  status: "idle" | "error" | "conflict";
  message: string | null;
  itemErrors: Record<number, string>;
};

// The menu editor is a client form; it submits its rows as JSON. A save
// replaces the whole menu atomically (save_navigation).
export async function saveNavigationAction(
  _previousState: NavigationFormState,
  formData: FormData,
): Promise<NavigationFormState> {
  const t = await getTranslations("adminPages");
  const context = await getEditorialContext();
  const fail = (message: string, itemErrors: Record<number, string> = {}): NavigationFormState => ({
    status: "error",
    message,
    itemErrors,
  });

  if (!context.user) return fail(t("actionErrors.noSession"));
  if (!canManagePages(context.membership)) return fail(t("errors.forbidden"));

  const location = getStringField(formData, "location");
  const expectedRevision = Number.parseInt(getStringField(formData, "revision").trim(), 10);
  if (!isNavigationLocation(location)) return fail(t("errors.failed"));
  if (!Number.isSafeInteger(expectedRevision) || expectedRevision < 1) {
    return { status: "conflict", message: t("navigation.conflict"), itemErrors: {} };
  }

  let rows: NavigationItemInput[];
  try {
    const parsed: unknown = JSON.parse(getStringField(formData, "items") || "[]");
    if (!Array.isArray(parsed)) throw new Error("not an array");
    rows = parsed.map((row): NavigationItemInput => {
      const value = (row ?? {}) as Record<string, unknown>;
      const label = typeof value.label === "string" ? value.label : "";
      return value.type === "page"
        ? { type: "page", pageId: typeof value.pageId === "string" ? value.pageId : "", label }
        : { type: "url", url: typeof value.url === "string" ? value.url : "", label };
    });
  } catch {
    return fail(t("errors.failed"));
  }

  const validation = validateNavigationItems(rows);
  if (!validation.ok) {
    if (validation.tooMany) return fail(t("navigation.tooMany"));

    const itemErrors: Record<number, string> = {};
    for (const [index, key] of Object.entries(validation.errors) as [string, NavigationItemError][]) {
      itemErrors[Number(index)] = t(`navigation.errors.${key}`);
    }
    return fail(t("actionErrors.formInvalid"), itemErrors);
  }

  const { error } = await (await createServerSupabaseClient()).rpc("save_navigation", {
    p_location: location,
    p_expected_revision: expectedRevision,
    p_items: validation.items,
  });

  if (error) {
    const key = pageActionErrorKey(error);
    if (key === "conflict") {
      return { status: "conflict", message: t("navigation.conflict"), itemErrors: {} };
    }
    return fail(
      key === "forbidden" || key === "rateLimited" ? t(`errors.${key}`) : t("navigation.saveFailed"),
    );
  }

  revalidateLocalizedPath("/admin/navigation");
  invalidatePageContent("navigation-changed");
  redirect(`/admin/navigation?status=${location}-saved`);
}
