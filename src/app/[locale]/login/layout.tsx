import { accountClientMessages } from "@/i18n/client-messages";
import { ClientMessages } from "@/i18n/client-messages-provider";

// Sign-in forms are Client Components; they get their messages here, not
// from the root layout, so public pages do not ship them.
export default function LoginLayout({ children }: LayoutProps<"/[locale]/login">) {
  return <ClientMessages paths={accountClientMessages}>{children}</ClientMessages>;
}
