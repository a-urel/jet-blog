import "server-only";

import { ImageResponse } from "next/og";

import { mediaPublicUrl } from "@/features/media/url";
import { allowedMediaTypes, maxMediaBytes } from "@/features/media/validation";
import { socialImageSize } from "@/features/seo/metadata";
import { siteSettingsCacheTag } from "./cache";
import { foregroundFor } from "./color";
import type { SiteSettings } from "./model";

// Images rendered from the site settings with next/og: the app icons
// (src/app/site-icon.png, src/app/apple-touch-icon.png) and the generated
// social image (src/app/opengraph-image.tsx). Fixed colors: a shared image or
// an icon has no system theme; the accent color, when set, replaces the
// neutral default.

const neutralBackground = "#171717";

// An uploaded image as a data: URL for next/og. next/og refuses remote
// sources on private addresses (its SSRF guard), which includes a local
// Supabase, so the bytes are fetched here. Media objects never change under
// their id, so the fetch may stay in the Data Cache. Only the media
// allowlist (no SVG) is accepted; anything else falls back to the generated
// image.
async function mediaDataUrl(mediaId: string): Promise<string | null> {
  const url = mediaPublicUrl(mediaId);
  if (!url) return null;

  try {
    const response = await fetch(url, { next: { tags: [siteSettingsCacheTag] } });
    if (!response.ok) return null;

    const type = response.headers.get("content-type")?.split(";")[0]?.trim() ?? "";
    if (!(allowedMediaTypes as readonly string[]).includes(type)) return null;

    const bytes = await response.arrayBuffer();
    if (bytes.byteLength === 0 || bytes.byteLength > maxMediaBytes) return null;

    return `data:${type};base64,${Buffer.from(bytes).toString("base64")}`;
  } catch {
    return null;
  }
}

function initial(siteName: string): string {
  return ([...siteName.trim()][0] ?? "?").toLocaleUpperCase();
}

// A square app icon of the given edge: the uploaded icon scaled to fit, or
// the first letter of the site name on the accent color.
export async function renderSiteIcon(site: SiteSettings, edge: number): Promise<ImageResponse> {
  const uploaded = site.iconMediaId ? await mediaDataUrl(site.iconMediaId) : null;
  const background = site.accentColor ?? neutralBackground;

  return new ImageResponse(
    uploaded ? (
      // next/og renders <img> into the PNG; next/image does not apply here.
      // eslint-disable-next-line @next/next/no-img-element
      <img src={uploaded} alt="" width={edge} height={edge} style={{ objectFit: "contain" }} />
    ) : (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          borderRadius: edge * 0.2,
          background,
          color: foregroundFor(background),
          fontSize: edge * 0.62,
          fontWeight: 600,
        }}
      >
        {initial(site.siteName)}
      </div>
    ),
    { width: edge, height: edge },
  );
}

// The generated social image: site name, tagline, and host, with an accent
// bar. Text uses next/og's bundled Geist font, which covers Turkish and
// German letters.
export async function renderSocialImage(
  site: SiteSettings,
  host: string | null,
): Promise<ImageResponse> {
  const accent = site.accentColor ?? "#fafafa";
  // The image is dark, so only the logo for dark backgrounds fits it.
  const logo = site.logoDarkMediaId ? await mediaDataUrl(site.logoDarkMediaId) : null;

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: "80px",
          background: neutralBackground,
          color: "#fafafa",
        }}
      >
        {logo ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={logo} alt="" height={96} style={{ maxWidth: 640, objectFit: "contain" }} />
        ) : (
          <div style={{ display: "flex", width: 120, height: 12, background: accent }} />
        )}
        <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
          <div
            style={{
              display: "flex",
              fontSize: site.siteName.length > 24 ? 88 : 120,
              fontWeight: 600,
              lineHeight: 1.1,
              letterSpacing: "-0.02em",
            }}
          >
            {site.siteName}
          </div>
          {site.tagline ? (
            <div style={{ display: "flex", fontSize: 44, color: "#d4d4d4" }}>{site.tagline}</div>
          ) : null}
        </div>
        <div style={{ display: "flex", fontSize: 36, color: "#a3a3a3" }}>{host ?? " "}</div>
      </div>
    ),
    { ...socialImageSize },
  );
}
