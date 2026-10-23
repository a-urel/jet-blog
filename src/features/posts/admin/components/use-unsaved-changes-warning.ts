"use client";

import { useEffect } from "react";

import {
  linkClickLeavesPage,
  unsavedChangesMessage,
} from "@/features/posts/admin/unsaved-changes";

// Warns before the author leaves a form with unsaved edits. Closing or
// reloading the tab shows the browser's own prompt; in-app links ask for
// confirmation before Next.js handles the click. A successful save redirects
// through the router, which neither listener intercepts.
export function useUnsavedChangesWarning(dirty: boolean) {
  useEffect(() => {
    if (!dirty) return;

    function handleBeforeUnload(event: BeforeUnloadEvent) {
      event.preventDefault();
      // Older browsers only show the prompt when returnValue is set.
      event.returnValue = "";
    }

    // Capture phase on the document runs before React's root listener, so a
    // cancelled click never reaches next/link.
    function handleClick(event: MouseEvent) {
      if (event.defaultPrevented) return;

      const anchor =
        event.target instanceof Element ? event.target.closest("a[href]") : null;
      if (!(anchor instanceof HTMLAnchorElement)) return;

      const leaves = linkClickLeavesPage(
        {
          href: anchor.href,
          target: anchor.target,
          download: anchor.hasAttribute("download"),
          button: event.button,
          modified: event.metaKey || event.ctrlKey || event.shiftKey || event.altKey,
        },
        window.location.href,
      );

      if (leaves && !window.confirm(unsavedChangesMessage)) {
        event.preventDefault();
        event.stopPropagation();
      }
    }

    window.addEventListener("beforeunload", handleBeforeUnload);
    document.addEventListener("click", handleClick, true);

    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload);
      document.removeEventListener("click", handleClick, true);
    };
  }, [dirty]);
}
