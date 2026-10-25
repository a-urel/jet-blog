import { describe, expect, it } from "vitest";

import { builtInLocaleConfig, resolveInterfaceLocale } from "@/lib/interface-locales";
import { siteSettingsCacheTag, siteSettingsInvalidation } from "./cache";
import {
  accentCss,
  accentPalette,
  contrastRatio,
  foregroundFor,
  minimumTextContrast,
  normalizeAccentColor,
  relativeLuminance,
} from "./color";
import { fallbackSiteSettings, mapSiteSettingsRow, normalizeLocaleConfig } from "./model";
import { socialLinkEntries, validateSocialUrl } from "./social";
import { validateSiteSettingsInput, type SiteSettingsFormValues } from "./validation";

const darkBackgrounds = [0.145 ** 3, 0.205 ** 3];

function lowest(hex: string, backgrounds: number[]) {
  return Math.min(...backgrounds.map((bg) => contrastRatio(relativeLuminance(hex), bg)));
}

describe("accent color", () => {
  it("accepts only #rrggbb (or #rgb) and lowercases it", () => {
    expect(normalizeAccentColor("#2563EB")).toBe("#2563eb");
    expect(normalizeAccentColor(" #abc ")).toBe("#aabbcc");
    for (const value of ["2563eb", "#2563e", "#2563ebff", "red", "rgb(0,0,0)", "#ggg000", "", "#12345;}"]) {
      expect(normalizeAccentColor(value)).toBeNull();
    }
  });

  it("computes WCAG contrast ratios", () => {
    expect(contrastRatio(relativeLuminance("#ffffff"), relativeLuminance("#000000"))).toBeCloseTo(21, 5);
    expect(contrastRatio(relativeLuminance("#777777"), 1)).toBeCloseTo(4.48, 2);
  });

  it("keeps a color that already reads well in a theme", () => {
    // Dark blue: fine on white, too dark on near-black.
    const palette = accentPalette("#1d4ed8");
    expect(palette.light).toMatchObject({ color: "#1d4ed8", adjusted: false });
    expect(palette.light.contrast).toBeGreaterThanOrEqual(minimumTextContrast);
    expect(palette.dark.adjusted).toBe(true);
  });

  it("adjusts each theme until text reaches 4.5:1 against every background", () => {
    for (const accent of ["#ffff00", "#000000", "#ffffff", "#777777", "#e11d48", "#22c55e", "#0a0a0a"]) {
      const palette = accentPalette(accent);
      expect(lowest(palette.light.color, [1])).toBeGreaterThanOrEqual(minimumTextContrast);
      expect(lowest(palette.dark.color, darkBackgrounds)).toBeGreaterThanOrEqual(minimumTextContrast);
      for (const theme of [palette.light, palette.dark]) {
        expect(
          contrastRatio(relativeLuminance(theme.color), relativeLuminance(theme.foreground)),
        ).toBeGreaterThanOrEqual(minimumTextContrast);
      }
    }
  });

  it("picks black or white text on the accent", () => {
    expect(foregroundFor("#ffff00")).toBe("#000000");
    expect(foregroundFor("#1d4ed8")).toBe("#ffffff");
  });

  it("emits CSS only for valid colors, for both system themes", () => {
    expect(accentCss(null)).toBeNull();
    expect(accentCss("red;} body{display:none")).toBeNull();
    const css = accentCss("#1D4ED8")!;
    expect(css).toMatch(/^:root:root\{--primary:#1d4ed8;--primary-foreground:#ffffff;/);
    expect(css).toContain("@media (prefers-color-scheme: dark){:root:root{--primary:#");
    expect(css).not.toMatch(/[<>"']/);
  });
});

describe("social links", () => {
  it("accepts https links on the provider's own host", () => {
    expect(validateSocialUrl("github", "https://github.com/ornek")).toEqual({
      ok: true,
      url: "https://github.com/ornek",
    });
    expect(validateSocialUrl("x", "https://twitter.com/ornek").ok).toBe(true);
    expect(validateSocialUrl("youtube", "https://www.youtube.com/@ornek").ok).toBe(true);
    expect(validateSocialUrl("website", "https://ornek.example/hakkinda").ok).toBe(true);
    expect(validateSocialUrl("mastodon", "https://mastodon.social/@ornek").ok).toBe(true);
  });

  it("refuses other schemes, lookalike hosts, credentials, and long URLs", () => {
    expect(validateSocialUrl("website", "http://ornek.example")).toEqual({ ok: false, issue: "notHttps" });
    expect(validateSocialUrl("website", "javascript:alert(1)")).toEqual({ ok: false, issue: "notHttps" });
    expect(validateSocialUrl("website", "ornek.example")).toEqual({ ok: false, issue: "invalid" });
    expect(validateSocialUrl("website", "https://user:pw@ornek.example")).toEqual({ ok: false, issue: "invalid" });
    expect(validateSocialUrl("website", "https://localhost/")).toEqual({ ok: false, issue: "invalid" });
    expect(validateSocialUrl("github", "https://github.com.evil.example/x")).toEqual({ ok: false, issue: "wrongHost" });
    expect(validateSocialUrl("github", "https://evilgithub.com/x")).toEqual({ ok: false, issue: "wrongHost" });
    expect(validateSocialUrl("website", `https://ornek.example/${"a".repeat(300)}`)).toEqual({
      ok: false,
      issue: "tooLong",
    });
  });

  it("re-validates stored links in allowlist order", () => {
    expect(
      socialLinkEntries({
        youtube: "https://youtube.com/@a",
        website: "https://ornek.example/",
        github: "https://evil.example/",
        unknown: "https://ornek.example/",
        x: 42,
      }),
    ).toEqual([
      { provider: "website", url: "https://ornek.example/" },
      { provider: "youtube", url: "https://youtube.com/@a" },
    ]);
    expect(socialLinkEntries(null)).toEqual([]);
    expect(socialLinkEntries(["https://ornek.example"])).toEqual([]);
  });
});

function formValues(overrides: Partial<SiteSettingsFormValues> = {}): SiteSettingsFormValues {
  return {
    siteName: "Örnek Blog",
    tagline: "",
    metaDescription: "",
    footerText: "",
    accentColor: "",
    logoLight: "",
    logoDark: "",
    icon: "",
    ogImage: "",
    social: {},
    defaultLocale: "tr",
    enabledLocales: ["tr", "en", "de"],
    searchIndexing: true,
    ...overrides,
  };
}

describe("validateSiteSettingsInput", () => {
  it("normalizes text, colors, links, and locales", () => {
    const result = validateSiteSettingsInput(
      formValues({
        siteName: "  Örnek   Blog ",
        tagline: " Kısa  slogan ",
        footerText: " Satır  bir \r\n\r\n\r\n Satır iki ",
        accentColor: "#ABC",
        logoLight: "99999999-9999-4999-8999-999999999999",
        social: { github: " https://github.com/ornek ", website: "" },
        defaultLocale: "en",
        enabledLocales: ["de", "en", "en"],
        searchIndexing: false,
      }),
    );

    expect(result).toEqual({
      ok: true,
      data: {
        siteName: "Örnek Blog",
        tagline: "Kısa slogan",
        metaDescription: null,
        footerText: "Satır bir\n\nSatır iki",
        accentColor: "#aabbcc",
        logoLightMediaId: "99999999-9999-4999-8999-999999999999",
        logoDarkMediaId: null,
        iconMediaId: null,
        ogImageMediaId: null,
        socialLinks: { github: "https://github.com/ornek" },
        defaultLocale: "en",
        enabledLocales: ["en", "de"],
        searchIndexing: false,
      },
    });
  });

  it("reports every invalid field", () => {
    const result = validateSiteSettingsInput(
      formValues({
        siteName: "   ",
        tagline: "a".repeat(161),
        accentColor: "blue",
        icon: "not-a-uuid",
        social: { x: "https://x.com.evil.example/a", website: "http://ornek.example" },
        defaultLocale: "en",
        enabledLocales: ["tr"],
      }),
    );

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.fieldErrors).toEqual({
      siteName: { key: "required" },
      tagline: { key: "tooLong", values: { max: 160 } },
      accentColor: { key: "invalidColor" },
      icon: { key: "invalidMedia" },
      "social.x": { key: "socialWrongHost", values: { max: 300 } },
      "social.website": { key: "socialNotHttps", values: { max: 300 } },
      defaultLocale: { key: "defaultNotEnabled" },
    });
  });

  it("requires a non-empty set of supported locales", () => {
    const empty = validateSiteSettingsInput(formValues({ enabledLocales: [] }));
    expect(empty.ok || empty.fieldErrors.enabledLocales).toEqual({ key: "localesEmpty" });

    const unknown = validateSiteSettingsInput(formValues({ enabledLocales: ["tr", "fr"] }));
    expect(unknown.ok || unknown.fieldErrors.enabledLocales).toEqual({ key: "invalidLocale" });

    const badDefault = validateSiteSettingsInput(formValues({ defaultLocale: "fr" }));
    expect(badDefault.ok || badDefault.fieldErrors.defaultLocale).toEqual({ key: "invalidLocale" });
  });
});

describe("site settings model", () => {
  it("falls back to the built-in locales for invalid stored values", () => {
    expect(normalizeLocaleConfig("en", ["de", "en"])).toEqual({
      defaultLocale: "en",
      enabledLocales: ["en", "de"],
    });
    expect(normalizeLocaleConfig("fr", ["tr"])).toEqual({
      defaultLocale: "tr",
      enabledLocales: ["tr", "en", "de"],
    });
    expect(normalizeLocaleConfig("en", ["tr"])).toEqual({
      defaultLocale: "tr",
      enabledLocales: ["tr", "en", "de"],
    });
  });

  it("maps a row and drops values that would not pass validation", () => {
    const settings = mapSiteSettingsRow({
      revision: 4,
      site_name: "Örnek",
      tagline: null,
      meta_description: null,
      logo_light_media_id: null,
      logo_dark_media_id: null,
      icon_media_id: null,
      og_image_media_id: null,
      accent_color: "#ABCDEF",
      social_links: { github: "https://github.com/a", x: "https://evil.example" },
      footer_text: null,
      default_locale: "de",
      enabled_locales: ["de"],
      search_indexing: false,
    });
    expect(settings).toMatchObject({
      revision: 4,
      siteName: "Örnek",
      accentColor: "#abcdef",
      socialLinks: { github: "https://github.com/a" },
      defaultLocale: "de",
      enabledLocales: ["de"],
      searchIndexing: false,
    });
  });

  it("uses revision 0 and every locale before the first save", () => {
    expect(fallbackSiteSettings()).toMatchObject({
      revision: 0,
      defaultLocale: "tr",
      enabledLocales: ["tr", "en", "de"],
      searchIndexing: true,
    });
  });
});

describe("interface locale negotiation with site settings", () => {
  const germanOnly = { defaultLocale: "de" as const, enabledLocales: ["de" as const] };
  const englishDefault = { defaultLocale: "en" as const, enabledLocales: ["tr" as const, "en" as const] };

  it("ignores a cookie for a disabled locale", () => {
    expect(resolveInterfaceLocale("tr", "tr", germanOnly)).toBe("de");
    expect(resolveInterfaceLocale("de", null, englishDefault)).toBe("en");
  });

  it("negotiates only among enabled locales, then uses the configured default", () => {
    expect(resolveInterfaceLocale(null, "de-DE,tr;q=0.5", englishDefault)).toBe("tr");
    expect(resolveInterfaceLocale(null, "fr", englishDefault)).toBe("en");
    expect(resolveInterfaceLocale("en", "tr", englishDefault)).toBe("en");
  });

  it("keeps the built-in behavior without settings", () => {
    expect(resolveInterfaceLocale(null, "de", builtInLocaleConfig)).toBe("de");
    expect(resolveInterfaceLocale(null, null)).toBe("tr");
  });
});

describe("site settings cache invalidation", () => {
  it("expires the settings tag and every route below the root layout", () => {
    expect(siteSettingsInvalidation()).toEqual({
      tags: [siteSettingsCacheTag],
      routes: [{ path: "/", type: "layout" }],
    });
  });
});
