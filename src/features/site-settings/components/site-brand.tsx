import Link from "next/link";
import { BookOpen } from "lucide-react";

import { mediaPublicUrl } from "@/features/media/url";
import type { SiteSettings } from "@/features/site-settings/model";

// Header brand: the uploaded logo, or the site name. With both logos the
// <picture> source follows prefers-color-scheme, so the browser swaps them
// with the system theme and no script or cookie is involved; with one logo
// it is used in both themes. The logo is the link's only content, so its alt
// text is the site name.
//
// A plain <img>: logo dimensions are not public (readers cannot read media
// rows), and next/image needs them or a sized box. The height is fixed by
// CSS and the width follows the aspect ratio.
export function SiteBrand({
  site,
}: {
  site: Pick<SiteSettings, "siteName" | "logoLightMediaId" | "logoDarkMediaId">;
}) {
  const light = site.logoLightMediaId ? mediaPublicUrl(site.logoLightMediaId) : null;
  const dark = site.logoDarkMediaId ? mediaPublicUrl(site.logoDarkMediaId) : null;
  const fallback = light ?? dark;

  return (
    <Link href="/" className="flex items-center gap-2 rounded-sm font-semibold">
      {fallback ? (
        <picture>
          {light && dark ? <source srcSet={dark} media="(prefers-color-scheme: dark)" /> : null}
          <img
            src={fallback}
            alt={site.siteName}
            className="h-8 w-auto max-w-[12rem] object-contain"
            decoding="async"
          />
        </picture>
      ) : (
        <>
          <BookOpen aria-hidden="true" className="size-5" />
          {site.siteName}
        </>
      )}
    </Link>
  );
}
