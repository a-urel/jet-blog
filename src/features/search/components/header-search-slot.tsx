"use client";

import type { ReactNode } from "react";
import { usePathname } from "next/navigation";

import { searchPath } from "../query";

// Wraps the header search form. The search page has its own, fuller form, so
// a second box in the header there would only compete with it. The form itself
// stays a static child; only this check runs in the browser.
export function HeaderSearchSlot({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  if (pathname === searchPath) return null;

  return <div className="order-last w-full sm:order-none sm:ml-auto sm:w-auto">{children}</div>;
}
