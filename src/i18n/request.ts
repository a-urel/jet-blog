import { headers } from "next/headers";
import { locale as rootLocale } from "next/root-params";
import { getRequestConfig } from "next-intl/server";

import {
  defaultInterfaceLocale,
  isInterfaceLocale,
  localeRequestHeader,
  type InterfaceLocale,
} from "@/lib/interface-locales";

import { catalogs } from "./catalogs";
import { formats, timeZone } from "./formats";

// Pages and layouts read the locale from the [locale] root parameter, which
// keeps them static: each locale is its own prerendered route. Server Actions
// and Route Handlers have no root parameters (next/root-params throws there),
// so they read the header src/proxy.ts sets on every rewritten request; that
// read is dynamic, which is fine for both.
async function requestInterfaceLocale(): Promise<InterfaceLocale> {
  let candidate: string | undefined;

  try {
    candidate = await rootLocale();
  } catch {
    candidate = (await headers()).get(localeRequestHeader) ?? undefined;
  }

  return isInterfaceLocale(candidate) ? candidate : defaultInterfaceLocale;
}

export default getRequestConfig(async ({ locale: override }) => {
  const locale = isInterfaceLocale(override) ? override : await requestInterfaceLocale();

  return {
    locale,
    messages: catalogs[locale],
    formats,
    timeZone,
  };
});
