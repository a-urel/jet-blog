import type { InterfaceLocale } from "@/lib/interface-locales";

import type { Messages } from "./catalogs";
import type { formats } from "./formats";

// Types every message key, ICU argument, locale, and named format used with
// next-intl against the Turkish source catalog.
declare module "next-intl" {
  interface AppConfig {
    Locale: InterfaceLocale;
    Messages: Messages;
    Formats: typeof formats;
  }
}
