import { renderSiteIcon } from "@/features/site-settings/brand-images";
import { getSiteSettings } from "@/features/site-settings/data";

// The browser tab and app icon (192×192 PNG), declared by the root layout
// metadata. A Route Handler with an extension rather than the `icon` file
// convention: src/proxy.ts skips paths with a dot, and the [locale] root
// layout would not pick up a root-level icon file anyway. ISR; a settings
// save regenerates it (src/features/site-settings/cache.ts).
export const revalidate = 300;

export async function GET() {
  return renderSiteIcon(await getSiteSettings(), 192);
}
