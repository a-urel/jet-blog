import { getTranslations } from "next-intl/server";

import type { SiteSettings } from "@/features/site-settings/model";
import { socialLinkEntries, socialProviderNames } from "@/features/site-settings/social";

// Footer identity: the footer text (else the tagline) and the social profile
// links from the site settings. Links are re-validated on read
// (socialLinkEntries) and marked rel="me" for profile verification.
export async function SiteFooterBrand({
  site,
}: {
  site: Pick<SiteSettings, "footerText" | "tagline" | "socialLinks">;
}) {
  const t = await getTranslations("common.layout");
  const text = site.footerText ?? site.tagline;
  const links = socialLinkEntries(site.socialLinks);

  return (
    <div className="space-y-2">
      {text ? <p className="whitespace-pre-line">{text}</p> : null}
      {links.length > 0 ? (
        <ul aria-label={t("socialLinks")} className="flex flex-wrap gap-x-3 gap-y-1">
          {links.map(({ provider, url }) => (
            <li key={provider}>
              <a
                href={url}
                rel="me noopener noreferrer"
                className="rounded-sm hover:text-foreground hover:underline underline-offset-4"
              >
                {provider === "website" ? t("website") : socialProviderNames[provider]}
              </a>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
