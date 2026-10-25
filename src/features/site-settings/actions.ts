"use server";

import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";

import { canManageSiteSettings, getEditorialContext } from "@/lib/auth/editorial";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { invalidateSiteSettings } from "./invalidate";
import { socialProviders } from "./social";
import {
  mediaFields,
  validateSiteSettingsInput,
  type MediaField,
  type SiteSettingsField,
  type SiteSettingsFieldIssues,
  type SiteSettingsFormValues,
} from "./validation";

export type SiteSettingsFieldErrors = Partial<Record<SiteSettingsField, string>>;

export type SiteSettingsFormState = {
  status: "idle" | "error";
  message: string | null;
  fieldErrors: SiteSettingsFieldErrors;
  // Submitted values become the next form values, so nothing typed is lost.
  values?: SiteSettingsFormValues;
};

function getString(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value : "";
}

function submittedValues(formData: FormData): SiteSettingsFormValues {
  const media = Object.fromEntries(
    mediaFields.map((field) => [field, getString(formData, field)]),
  ) as Record<MediaField, string>;

  return {
    siteName: getString(formData, "siteName"),
    tagline: getString(formData, "tagline"),
    metaDescription: getString(formData, "metaDescription"),
    footerText: getString(formData, "footerText"),
    accentColor: getString(formData, "accentColor"),
    ...media,
    social: Object.fromEntries(
      socialProviders.map((provider) => [provider, getString(formData, `social.${provider}`)]),
    ),
    defaultLocale: getString(formData, "defaultLocale"),
    enabledLocales: formData
      .getAll("enabledLocales")
      .filter((value): value is string => typeof value === "string"),
    searchIndexing: formData.get("searchIndexing") === "on",
  };
}

function errorState(
  formData: FormData,
  message: string,
  fieldErrors: SiteSettingsFieldErrors = {},
): SiteSettingsFormState {
  return { status: "error", message, fieldErrors, values: submittedValues(formData) };
}

async function translateIssues(issues: SiteSettingsFieldIssues): Promise<SiteSettingsFieldErrors> {
  const t = await getTranslations("adminSettings.validation");
  const errors: SiteSettingsFieldErrors = {};
  for (const [field, issue] of Object.entries(issues) as [
    SiteSettingsField,
    NonNullable<SiteSettingsFieldIssues[SiteSettingsField]>,
  ][]) {
    errors[field] = t(issue.key, issue.values);
  }
  return errors;
}

type RpcError = { code?: string; details?: string | null } | null;

function isMediaField(value: unknown): value is MediaField {
  return typeof value === "string" && (mediaFields as readonly string[]).includes(value);
}

async function mapRpcError(
  error: RpcError,
): Promise<{ message: string; fieldErrors?: SiteSettingsFieldErrors }> {
  const [t, tActions] = await Promise.all([
    getTranslations("adminSettings.errors"),
    getTranslations("admin.actions"),
  ]);
  // assert_site_settings_media() names the media field in the error detail.
  const field = isMediaField(error?.details) ? error.details : null;

  switch (error?.code) {
    case "42501":
      return { message: t("forbidden") };
    case "PT429":
      return { message: tActions("rateLimited") };
    case "40001":
      return { message: t("stale") };
    case "P0002":
    case "23503":
      return field
        ? { message: tActions("fixErrors"), fieldErrors: { [field]: t("mediaMissing") } }
        : { message: t("mediaMissing") };
    case "22023":
      if (field === "icon") {
        return { message: tActions("fixErrors"), fieldErrors: { icon: t("iconShape") } };
      }
      if (field === "ogImage") {
        return { message: tActions("fixErrors"), fieldErrors: { ogImage: t("ogImageSize") } };
      }
      return { message: tActions("invalidInput") };
    case "23514":
      return { message: tActions("invalidInput") };
    default:
      return { message: tActions("failed") };
  }
}

// Admin only (D1). update_site_settings() re-checks admin membership, the
// rate limit, the media references, and the loaded revision; this check only
// gives a clear message without a database round trip.
export async function updateSiteSettingsAction(
  _previousState: SiteSettingsFormState,
  formData: FormData,
): Promise<SiteSettingsFormState> {
  const [{ user, membership }, t, tActions] = await Promise.all([
    getEditorialContext(),
    getTranslations("adminSettings.errors"),
    getTranslations("admin.actions"),
  ]);
  if (!user) return errorState(formData, tActions("sessionMissing"));
  if (!canManageSiteSettings(membership)) return errorState(formData, t("forbidden"));

  const revision = Number(getString(formData, "revision"));
  if (!Number.isInteger(revision) || revision < 0) {
    return errorState(formData, tActions("invalidRequest"));
  }

  const input = validateSiteSettingsInput(submittedValues(formData));
  if (!input.ok) {
    return errorState(formData, tActions("fixErrors"), await translateIssues(input.fieldErrors));
  }

  const { data } = input;
  const supabase = await createServerSupabaseClient();
  const { error } = await supabase.rpc("update_site_settings", {
    p_expected_revision: revision,
    p_site_name: data.siteName,
    p_tagline: data.tagline,
    p_meta_description: data.metaDescription,
    p_logo_light_media_id: data.logoLightMediaId,
    p_logo_dark_media_id: data.logoDarkMediaId,
    p_icon_media_id: data.iconMediaId,
    p_og_image_media_id: data.ogImageMediaId,
    p_accent_color: data.accentColor,
    p_social_links: data.socialLinks,
    p_footer_text: data.footerText,
    p_default_locale: data.defaultLocale,
    p_enabled_locales: data.enabledLocales,
    p_search_indexing: data.searchIndexing,
  });

  if (error) {
    const mapped = await mapRpcError(error);
    return errorState(formData, mapped.message, mapped.fieldErrors);
  }

  // Every public page, feed, icon, and robots.txt (./cache.ts).
  invalidateSiteSettings();
  redirect("/admin/settings?status=saved");
}
