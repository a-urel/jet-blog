import type { Metadata } from "next";

import { accountClientMessages } from "@/i18n/client-messages";
import { ClientMessages } from "@/i18n/client-messages-provider";

// Account routes are per-user and dynamic (they read the session cookie), so
// they are never prerendered or publicly cached. Keep them out of search.
export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

export default function AccountLayout({ children }: LayoutProps<"/[locale]/account">) {
  return <ClientMessages paths={accountClientMessages}>{children}</ClientMessages>;
}
