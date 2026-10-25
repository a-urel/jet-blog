import { isUuid } from "@/features/posts/admin/validation";
import {
  interfaceLocales,
  isInterfaceLocale,
  type InterfaceLocale,
} from "@/lib/interface-locales";
import { normalizeAccentColor } from "./color";
import {
  maxSocialUrlLength,
  socialProviders,
  validateSocialUrl,
  type SocialLinks,
  type SocialProvider,
} from "./social";

// Server-side validation of the settings form. Text is trimmed, empty
// optional text becomes null, and the limits match the table CHECK
// constraints (supabase/migrations/20261025120000_site_settings.sql), which
// stay the final authority. Issues are catalog keys under
// adminSettings.validation, translated by the Server Action.

export const siteSettingsLimits = {
  siteName: 80,
  tagline: 160,
  metaDescription: 300,
  footerText: 500,
  socialUrl: maxSocialUrlLength,
} as const;

export const mediaFields = ["logoLight", "logoDark", "icon", "ogImage"] as const;
export type MediaField = (typeof mediaFields)[number];

export type SiteSettingsField =
  | "siteName"
  | "tagline"
  | "metaDescription"
  | "footerText"
  | "accentColor"
  | MediaField
  | `social.${SocialProvider}`
  | "defaultLocale"
  | "enabledLocales";

export type SiteSettingsIssue = {
  key:
    | "required"
    | "tooLong"
    | "invalidColor"
    | "invalidMedia"
    | "socialInvalid"
    | "socialNotHttps"
    | "socialWrongHost"
    | "socialTooLong"
    | "localesEmpty"
    | "invalidLocale"
    | "defaultNotEnabled";
  values?: Record<string, string | number>;
};

export type SiteSettingsFieldIssues = Partial<Record<SiteSettingsField, SiteSettingsIssue>>;

// Raw form values: one string per field, the enabled locales as a list.
export type SiteSettingsFormValues = {
  siteName: string;
  tagline: string;
  metaDescription: string;
  footerText: string;
  accentColor: string;
  logoLight: string;
  logoDark: string;
  icon: string;
  ogImage: string;
  social: Partial<Record<SocialProvider, string>>;
  defaultLocale: string;
  enabledLocales: string[];
  searchIndexing: boolean;
};

export type SiteSettingsInput = {
  siteName: string;
  tagline: string | null;
  metaDescription: string | null;
  footerText: string | null;
  accentColor: string | null;
  logoLightMediaId: string | null;
  logoDarkMediaId: string | null;
  iconMediaId: string | null;
  ogImageMediaId: string | null;
  socialLinks: SocialLinks;
  defaultLocale: InterfaceLocale;
  enabledLocales: InterfaceLocale[];
  searchIndexing: boolean;
};

// Collapses inner whitespace runs in single-line fields; the footer keeps its
// line breaks (rendered with whitespace-pre-line).
function singleLine(value: string): string {
  return value.replace(/\s+/gu, " ").trim();
}

function multiLine(value: string): string {
  return value
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((line) => line.replace(/[^\S\n]+/gu, " ").trim())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function validateSiteSettingsInput(
  values: SiteSettingsFormValues,
): { ok: true; data: SiteSettingsInput } | { ok: false; fieldErrors: SiteSettingsFieldIssues } {
  const issues: SiteSettingsFieldIssues = {};

  const text = (
    field: "siteName" | "tagline" | "metaDescription" | "footerText",
    raw: string,
    required = false,
  ): string | null => {
    const value = field === "footerText" ? multiLine(raw) : singleLine(raw);
    if (!value) {
      if (required) issues[field] = { key: "required" };
      return null;
    }
    const max = siteSettingsLimits[field];
    if ([...value].length > max) issues[field] = { key: "tooLong", values: { max } };
    return value;
  };

  const siteName = text("siteName", values.siteName, true) ?? "";
  const tagline = text("tagline", values.tagline);
  const metaDescription = text("metaDescription", values.metaDescription);
  const footerText = text("footerText", values.footerText);

  let accentColor: string | null = null;
  if (values.accentColor.trim()) {
    accentColor = normalizeAccentColor(values.accentColor);
    if (!accentColor) issues.accentColor = { key: "invalidColor" };
  }

  const media = {} as Record<MediaField, string | null>;
  for (const field of mediaFields) {
    const raw = values[field].trim();
    media[field] = raw || null;
    if (raw && !isUuid(raw)) issues[field] = { key: "invalidMedia" };
  }

  const socialLinks: SocialLinks = {};
  for (const provider of socialProviders) {
    const raw = values.social[provider]?.trim() ?? "";
    if (!raw) continue;
    const result = validateSocialUrl(provider, raw);
    if (result.ok) {
      socialLinks[provider] = result.url;
    } else {
      const key = (
        {
          invalid: "socialInvalid",
          notHttps: "socialNotHttps",
          wrongHost: "socialWrongHost",
          tooLong: "socialTooLong",
        } as const
      )[result.issue];
      issues[`social.${provider}`] = { key, values: { max: maxSocialUrlLength } };
    }
  }

  // Canonical order, no duplicates.
  const unknownLocale = values.enabledLocales.some((locale) => !isInterfaceLocale(locale));
  const enabledLocales = interfaceLocales.filter((locale) => values.enabledLocales.includes(locale));
  if (unknownLocale) {
    issues.enabledLocales = { key: "invalidLocale" };
  } else if (enabledLocales.length === 0) {
    issues.enabledLocales = { key: "localesEmpty" };
  }

  const defaultLocale = values.defaultLocale;
  if (!isInterfaceLocale(defaultLocale)) {
    issues.defaultLocale = { key: "invalidLocale" };
  } else if (enabledLocales.length > 0 && !enabledLocales.includes(defaultLocale)) {
    issues.defaultLocale = { key: "defaultNotEnabled" };
  }

  if (Object.keys(issues).length > 0) return { ok: false, fieldErrors: issues };

  return {
    ok: true,
    data: {
      siteName,
      tagline,
      metaDescription,
      footerText,
      accentColor,
      logoLightMediaId: media.logoLight,
      logoDarkMediaId: media.logoDark,
      iconMediaId: media.icon,
      ogImageMediaId: media.ogImage,
      socialLinks,
      defaultLocale: defaultLocale as InterfaceLocale,
      enabledLocales,
      searchIndexing: values.searchIndexing,
    },
  };
}
