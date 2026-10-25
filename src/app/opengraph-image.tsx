import { getSiteSettings } from "@/features/site-settings/data";
import { renderSocialImage } from "@/features/site-settings/brand-images";
import { socialImageSize } from "@/features/seo/metadata";
import { getConfiguredSiteUrl } from "@/lib/site-url";

// Generated site-wide social image (site name, tagline, accent, host). Pages
// declare it through defaultSocialImage() unless the site settings choose an
// uploaded default image instead. It reads the settings, so it is ISR: a
// settings save regenerates it (src/features/site-settings/cache.ts), and
// the ?v=<revision> in the declared URL makes social platforms fetch the new
// version.
export const revalidate = 300;

export const alt = "";
export const size = socialImageSize;
export const contentType = "image/png";

export default async function Image() {
  const site = await getSiteSettings();
  return renderSocialImage(site, getConfiguredSiteUrl()?.host ?? null);
}
