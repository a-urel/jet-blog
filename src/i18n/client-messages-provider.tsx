import type { ReactNode } from "react";
import { NextIntlClientProvider } from "next-intl";
import { getMessages } from "next-intl/server";

import type { Messages } from "./catalogs";
import { pickMessages } from "./client-messages";

// Provides the listed message subtrees (src/i18n/client-messages.ts) to the
// Client Components below. A nested provider replaces the outer messages, so
// every list repeats the public ones.
export async function ClientMessages({
  paths,
  children,
}: {
  paths: readonly string[];
  children: ReactNode;
}) {
  const messages = (await getMessages()) as Messages;

  return (
    <NextIntlClientProvider messages={pickMessages(messages, paths)}>{children}</NextIntlClientProvider>
  );
}
