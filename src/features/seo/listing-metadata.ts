import "server-only";

import { getLocale, getTranslations } from "next-intl/server";

import {
  defaultInterfaceLocale,
  interfaceOpenGraphLocales,
  isInterfaceLocale,
} from "@/lib/interface-locales";
import type { PageTitleFormatter } from "./metadata";

// Interface-language inputs of listing and archive metadata: the translated
// later-page title format and the matching Open Graph locale. Reads the
// [locale] root parameter through next-intl, so listings stay static.
export async function listingMetadataContext(): Promise<{
  pageTitle: PageTitleFormatter;
  locale: string;
}> {
  const [t, locale] = await Promise.all([getTranslations("common.pagination"), getLocale()]);

  return {
    pageTitle: (title, page) => t("pageTitle", { title, page }),
    locale: interfaceOpenGraphLocales[isInterfaceLocale(locale) ? locale : defaultInterfaceLocale],
  };
}
