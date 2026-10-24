import { ImageResponse } from "next/og";

import { socialImageSize } from "@/features/seo/metadata";
import { getConfiguredSiteUrl, getSiteName } from "@/lib/site-url";

// Site-wide social image: the home page gets it through this file convention,
// and posts without a cover and archive pages reference it through
// defaultSocialImage(). It reads no data and no request-time API, so the build
// renders it once (static route handler); a site name change needs a rebuild,
// like every other NEXT_PUBLIC_ value. Text uses next/og's bundled Geist font,
// which covers Turkish letters. Fixed colors: a shared image has no theme.
const siteName = getSiteName();
const host = getConfiguredSiteUrl()?.host ?? null;

export const alt = siteName;
export const size = socialImageSize;
export const contentType = "image/png";

export default function Image() {
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
          background: "#171717",
          color: "#fafafa",
        }}
      >
        <div style={{ display: "flex", width: 120, height: 12, background: "#fafafa" }} />
        <div
          style={{
            display: "flex",
            fontSize: siteName.length > 24 ? 88 : 120,
            fontWeight: 600,
            lineHeight: 1.1,
            letterSpacing: "-0.02em",
          }}
        >
          {siteName}
        </div>
        <div style={{ display: "flex", fontSize: 36, color: "#a3a3a3" }}>
          {host ?? " "}
        </div>
      </div>
    ),
    { ...size },
  );
}
