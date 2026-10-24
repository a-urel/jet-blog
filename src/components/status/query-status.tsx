"use client";

import { useEffect } from "react";
import { useSearchParams } from "next/navigation";
import { toast } from "sonner";

// Shows a success message that arrived through a `?status=` redirect as a
// toast, then drops the parameter: the message describes the previous action,
// so a reload or the next submission must not repeat it. The page resolves the
// message on the server and renders this only for a known status. Next.js
// syncs `useSearchParams` with `history.replaceState`, so the same status
// after the next redirect toasts again.
export function QueryStatusToast({ message }: { message: string }) {
  const searchParams = useSearchParams();
  const status = searchParams.get("status");

  useEffect(() => {
    if (!status) return;

    // The id makes a repeated run (React Strict Mode in development) update
    // the same toast instead of adding a second one.
    toast.success(message, { id: `query-status-${status}` });

    const url = new URL(window.location.href);
    url.searchParams.delete("status");
    window.history.replaceState(null, "", url);
  }, [status, message]);

  return null;
}
