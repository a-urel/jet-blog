"use client";

import { useEffect, type ReactNode } from "react";
import { useSearchParams } from "next/navigation";

// Shows a success message that arrived through a `?status=` redirect. The
// message describes the previous action, so the next form submission on the
// page drops the parameter: a rejected submission no longer shows an old
// success next to its error, and a successful one redirects with a fresh
// status. Next.js syncs `useSearchParams` with `history.replaceState`.
export function QueryStatus({ children }: { children: ReactNode }) {
  const searchParams = useSearchParams();
  const hasStatus = searchParams.has("status");

  useEffect(() => {
    if (!hasStatus) return;

    function handleSubmit() {
      const url = new URL(window.location.href);
      url.searchParams.delete("status");
      window.history.replaceState(null, "", url);
    }

    document.addEventListener("submit", handleSubmit, true);
    return () => document.removeEventListener("submit", handleSubmit, true);
  }, [hasStatus]);

  return hasStatus ? children : null;
}
