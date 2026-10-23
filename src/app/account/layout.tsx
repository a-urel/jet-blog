import type { Metadata } from "next";

// Account routes are per-user and dynamic (they read the session cookie), so
// they are never prerendered or publicly cached. Keep them out of search.
export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

export default function AccountLayout({ children }: LayoutProps<"/account">) {
  return children;
}
