import { renderSiteIcon } from "@/features/site-settings/brand-images";
import { getSiteSettings } from "@/features/site-settings/data";

// Home-screen icon (180×180 PNG) at the path iOS also requests without a
// link tag. See src/app/site-icon.png/route.ts.
export const revalidate = 300;

export async function GET() {
  return renderSiteIcon(await getSiteSettings(), 180);
}
