import {
  defaultInterfaceLocale,
  interfaceLocales,
  isInterfaceLocale,
  type InterfaceLocale,
  type InterfaceLocaleConfig,
} from "@/lib/interface-locales";
import { getSiteName } from "@/lib/site-url";
import { normalizeAccentColor } from "./color";
import { socialLinkEntries, type SocialLinks } from "./social";

// The public site settings (public.site_settings, Phase 27). One row per
// deployment; branding text has one value for every interface language.

export type SiteSettings = {
  // 0 while no row exists (the first save creates it).
  revision: number;
  siteName: string;
  tagline: string | null;
  metaDescription: string | null;
  logoLightMediaId: string | null;
  logoDarkMediaId: string | null;
  iconMediaId: string | null;
  ogImageMediaId: string | null;
  accentColor: string | null;
  socialLinks: SocialLinks;
  footerText: string | null;
  defaultLocale: InterfaceLocale;
  enabledLocales: InterfaceLocale[];
  searchIndexing: boolean;
};

// Columns readable by everyone (updated_by is not granted).
export const siteSettingsColumns =
  "revision, site_name, tagline, meta_description, logo_light_media_id, logo_dark_media_id, icon_media_id, og_image_media_id, accent_color, social_links, footer_text, default_locale, enabled_locales, search_indexing";

export type SiteSettingsRow = {
  revision: number;
  site_name: string;
  tagline: string | null;
  meta_description: string | null;
  logo_light_media_id: string | null;
  logo_dark_media_id: string | null;
  icon_media_id: string | null;
  og_image_media_id: string | null;
  accent_color: string | null;
  social_links: unknown;
  footer_text: string | null;
  default_locale: string;
  enabled_locales: string[] | null;
  search_indexing: boolean;
};

// Used until an admin saves the settings for the first time, and when the
// row cannot be read. NEXT_PUBLIC_SITE_NAME is only this fallback now.
export function fallbackSiteSettings(): SiteSettings {
  return {
    revision: 0,
    siteName: getSiteName(),
    tagline: null,
    metaDescription: null,
    logoLightMediaId: null,
    logoDarkMediaId: null,
    iconMediaId: null,
    ogImageMediaId: null,
    accentColor: null,
    socialLinks: {},
    footerText: null,
    defaultLocale: defaultInterfaceLocale,
    enabledLocales: [...interfaceLocales],
    searchIndexing: true,
  };
}

// The enabled locales in the canonical order, with the default always
// included. Invalid stored values fall back to the built-in configuration.
export function normalizeLocaleConfig(
  defaultLocale: unknown,
  enabledLocales: unknown,
): InterfaceLocaleConfig {
  const enabled = Array.isArray(enabledLocales)
    ? interfaceLocales.filter((locale) => enabledLocales.includes(locale))
    : [];
  if (!isInterfaceLocale(defaultLocale) || !enabled.includes(defaultLocale)) {
    return { defaultLocale: defaultInterfaceLocale, enabledLocales: [...interfaceLocales] };
  }
  return { defaultLocale, enabledLocales: enabled };
}

export function mapSiteSettingsRow(row: SiteSettingsRow): SiteSettings {
  const locales = normalizeLocaleConfig(row.default_locale, row.enabled_locales);
  const socialLinks: SocialLinks = {};
  for (const { provider, url } of socialLinkEntries(row.social_links)) {
    socialLinks[provider] = url;
  }

  return {
    revision: row.revision,
    siteName: row.site_name.trim() || getSiteName(),
    tagline: row.tagline,
    metaDescription: row.meta_description,
    logoLightMediaId: row.logo_light_media_id,
    logoDarkMediaId: row.logo_dark_media_id,
    iconMediaId: row.icon_media_id,
    ogImageMediaId: row.og_image_media_id,
    accentColor: row.accent_color ? normalizeAccentColor(row.accent_color) : null,
    socialLinks,
    footerText: row.footer_text,
    defaultLocale: locales.defaultLocale,
    enabledLocales: [...locales.enabledLocales],
    searchIndexing: row.search_indexing,
  };
}
