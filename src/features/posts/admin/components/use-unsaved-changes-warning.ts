"use client";

import { useEffect } from "react";

import {
  historyNavigationLeavesPage,
  linkClickLeavesPage,
  unsavedChangesMessage,
  type HistoryNavigation,
} from "@/features/posts/admin/unsaved-changes";

type NavigationTarget = {
  addEventListener(type: "navigate", listener: (event: NavigateEventLike) => void): void;
  removeEventListener(type: "navigate", listener: (event: NavigateEventLike) => void): void;
};

type NavigateEventLike = HistoryNavigation & { preventDefault(): void };

// Warns before the author leaves a form with unsaved edits. Closing or
// reloading the tab shows the browser's own prompt; in-app links ask for
// confirmation before Next.js handles the click; Back/Forward between app
// pages asks through the Navigation API where the browser supports it and
// allows the traversal to be cancelled (see historyNavigationLeavesPage).
// A successful save redirects through the router, which none of the
// listeners intercepts.
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

    // A cancelled traversal never changes the history entry, so the router's
    // popstate listener does not run and the form stays mounted.
    function handleNavigate(event: NavigateEventLike) {
      if (historyNavigationLeavesPage(event) && !window.confirm(unsavedChangesMessage)) {
        event.preventDefault();
      }
    }

    const navigation = (window as Window & { navigation?: NavigationTarget }).navigation;

    window.addEventListener("beforeunload", handleBeforeUnload);
    document.addEventListener("click", handleClick, true);
    navigation?.addEventListener("navigate", handleNavigate);

    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload);
      document.removeEventListener("click", handleClick, true);
      navigation?.removeEventListener("navigate", handleNavigate);
    };
  }, [dirty]);
}
