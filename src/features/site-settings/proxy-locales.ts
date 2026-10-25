import {
  builtInLocaleConfig,
  type InterfaceLocaleConfig,
} from "@/lib/interface-locales";
import { getSupabaseEnvironment, isSupabaseConfigured } from "@/lib/supabase/env";
import { proxyLocaleTtlMs } from "./cache";
import { normalizeLocaleConfig } from "./model";

// Locale settings for src/proxy.ts, which runs before every page and cannot
// use the Data Cache. One anonymous PostgREST read per server instance and
// TTL window (./cache.ts); concurrent requests share the pending read. A
// failed read keeps the last known value (or the built-in configuration), so
// a database hiccup never blocks a page.

type Entry = { config: InterfaceLocaleConfig; expiresAt: number };

let entry: Entry | null = null;
let pending: Promise<InterfaceLocaleConfig> | null = null;

async function fetchLocaleConfig(): Promise<InterfaceLocaleConfig> {
  const { url, publishableKey } = getSupabaseEnvironment();
  const response = await fetch(
    `${url.replace(/\/+$/, "")}/rest/v1/site_settings?select=default_locale,enabled_locales&limit=1`,
    {
      headers: { apikey: publishableKey, Accept: "application/json" },
      cache: "no-store",
      signal: AbortSignal.timeout(2000),
    },
  );
  if (!response.ok) throw new Error(`Locale settings returned ${response.status}`);

  const rows = (await response.json()) as { default_locale?: unknown; enabled_locales?: unknown }[];
  const row = rows[0];
  return row ? normalizeLocaleConfig(row.default_locale, row.enabled_locales) : builtInLocaleConfig;
}

export async function getProxyLocaleConfig(now = Date.now()): Promise<InterfaceLocaleConfig> {
  if (!isSupabaseConfigured()) return builtInLocaleConfig;
  if (entry && entry.expiresAt > now) return entry.config;

  pending ??= fetchLocaleConfig()
    .catch(() => entry?.config ?? builtInLocaleConfig)
    .then((config) => {
      entry = { config, expiresAt: Date.now() + proxyLocaleTtlMs };
      return config;
    })
    .finally(() => {
      pending = null;
    });

  return pending;
}
