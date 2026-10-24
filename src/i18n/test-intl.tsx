import type { ReactNode } from "react";
import { NextIntlClientProvider } from "next-intl";

import type { InterfaceLocale } from "@/lib/interface-locales";

import { catalogs } from "./catalogs";
import { formats, timeZone } from "./formats";

// Tests render components outside Next.js, where next-intl reads its
// configuration from this provider instead of src/i18n/request.ts.
export function withIntl(children: ReactNode, locale: InterfaceLocale = "tr") {
  return (
    <NextIntlClientProvider
      locale={locale}
      messages={catalogs[locale]}
      formats={formats}
      timeZone={timeZone}
    >
      {children}
    </NextIntlClientProvider>
  );
}
