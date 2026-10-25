import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";

import { QueryStatusToast } from "@/components/status/query-status";
import { EditorialAccessDenied } from "@/features/auth/components/editorial-access-denied";
import { StatusNotice } from "@/features/auth/components/auth-page-shell";
import { listMedia } from "@/features/media/data";
import { updateSiteSettingsAction } from "@/features/site-settings/actions";
import { SiteSettingsForm } from "@/features/site-settings/components/site-settings-form";
import { getCurrentSiteSettings } from "@/features/site-settings/data";
import type { SiteSettings } from "@/features/site-settings/model";
import { socialProviders } from "@/features/site-settings/social";
import type { SiteSettingsFormValues } from "@/features/site-settings/validation";
import { canManageSiteSettings, getEditorialContext } from "@/lib/auth/editorial";
import { getConfiguredSiteUrl } from "@/lib/site-url";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("adminSettings");
  return { title: t("metaTitle") };
}

function formValues(site: SiteSettings): SiteSettingsFormValues {
  return {
    siteName: site.siteName,
    tagline: site.tagline ?? "",
    metaDescription: site.metaDescription ?? "",
    footerText: site.footerText ?? "",
    accentColor: site.accentColor ?? "",
    logoLight: site.logoLightMediaId ?? "",
    logoDark: site.logoDarkMediaId ?? "",
    icon: site.iconMediaId ?? "",
    ogImage: site.ogImageMediaId ?? "",
    social: Object.fromEntries(
      socialProviders.map((provider) => [provider, site.socialLinks[provider] ?? ""]),
    ),
    defaultLocale: site.defaultLocale,
    enabledLocales: [...site.enabledLocales],
    searchIndexing: site.searchIndexing,
  };
}

// Admin only (D1). The admin layout already requires an active membership;
// editors and authors get a denial here, and update_site_settings() refuses
// them in the database as well.
export default async function AdminSettingsPage({
  searchParams,
}: PageProps<"/[locale]/admin/settings">) {
  const { user, membership } = await getEditorialContext();
  if (!user) redirect("/login");

  const t = await getTranslations("adminSettings");

  if (!canManageSiteSettings(membership)) {
    return (
      <EditorialAccessDenied
        title={t("denied.title")}
        description={t("denied.description")}
        email={user.email}
      />
    );
  }

  // An uncached read: the form must carry the current revision.
  const [{ status }, site, library] = await Promise.all([
    searchParams,
    getCurrentSiteSettings(),
    listMedia(),
  ]);

  return (
    <div className="space-y-8">
      <div className="space-y-2">
        <h1 className="text-3xl font-semibold tracking-tight">{t("title")}</h1>
        <p className="max-w-2xl text-muted-foreground">{t("intro")}</p>
      </div>

      {status === "saved" ? <QueryStatusToast message={t("status.saved")} /> : null}
      {site.revision === 0 ? <StatusNotice>{t("fallbackNotice")}</StatusNotice> : null}
      {getConfiguredSiteUrl() ? null : <StatusNotice>{t("noSiteUrl")}</StatusNotice>}

      <SiteSettingsForm
        action={updateSiteSettingsAction}
        revision={site.revision}
        initialValues={formValues(site)}
        media={library.media.map(({ id, width, height }) => ({ id, width, height }))}
        mediaError={library.error}
      />
    </div>
  );
}
