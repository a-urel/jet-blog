import "server-only";

import { cache } from "react";

import { isSupabaseConfigured } from "@/lib/supabase/env";
import {
  createPublicServerSupabaseClient,
  createServerSupabaseClient,
} from "@/lib/supabase/server";
import { siteSettingsCacheTag } from "./cache";
import {
  fallbackSiteSettings,
  mapSiteSettingsRow,
  siteSettingsColumns,
  type SiteSettings,
  type SiteSettingsRow,
} from "./model";

// The public settings row through the anonymous client, cached as described
// in ./cache.ts. A missing row (no admin has saved yet) or a checkout without
// Supabase uses the fallback. A read error throws, like the public post
// reads, so a transient failure is not cached as the fallback brand.
export const getSiteSettings = cache(async (): Promise<SiteSettings> => {
  if (!isSupabaseConfigured()) return fallbackSiteSettings();

  const supabase = createPublicServerSupabaseClient({ cacheTags: [siteSettingsCacheTag] });
  const { data, error } = await supabase
    .from("site_settings")
    .select(siteSettingsColumns)
    .maybeSingle();

  if (error) throw new Error(`Site settings could not be loaded: ${error.message}`);
  return data ? mapSiteSettingsRow(data as SiteSettingsRow) : fallbackSiteSettings();
});

// The settings form must load the current revision, never a cached copy, or
// every save would be refused as stale. The session client's fetches carry
// no cache tags and the admin route is dynamic.
export async function getCurrentSiteSettings(): Promise<SiteSettings> {
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase
    .from("site_settings")
    .select(siteSettingsColumns)
    .maybeSingle();

  if (error) throw new Error(`Site settings could not be loaded: ${error.message}`);
  return data ? mapSiteSettingsRow(data as SiteSettingsRow) : fallbackSiteSettings();
}
