export type LinkClick = Readonly<{
  href: string;
  target: string;
  download: boolean;
  button: number;
  modified: boolean;
}>;

// Decides whether an in-app link click would discard the open form. Links that
// open elsewhere (new tab, download, modified click, other origin) leave this
// page alone or are covered by the browser's own beforeunload prompt, and an
// in-page fragment does not navigate away.
export function linkClickLeavesPage(click: LinkClick, currentHref: string): boolean {
  if (click.button !== 0 || click.modified || click.download) return false;
  if (click.target && click.target !== "_self") return false;

  let destination: URL;
  let current: URL;

  try {
    current = new URL(currentHref);
    destination = new URL(click.href, current);
  } catch {
    return false;
  }

  if (destination.origin !== current.origin) return false;

  const samePage =
    destination.pathname === current.pathname && destination.search === current.search;

  return !(samePage && destination.hash !== "");
}

// The subset of a Navigation API NavigateEvent the guard reads. TypeScript's
// DOM library does not declare the Navigation API yet.
export type HistoryNavigation = Readonly<{
  navigationType: "push" | "replace" | "reload" | "traverse";
  cancelable: boolean;
  hashChange: boolean;
}>;

// Decides whether a Back/Forward traversal should ask first. Next.js moves
// between app pages on popstate and has no hook to block it, so the guard
// cancels the traversal itself before popstate fires. Only cancelable,
// same-document traversals qualify: push and replace are the app's own
// navigations (links are guarded on click, a save redirects on purpose), a
// reload or cross-document traversal is covered by beforeunload, and a
// fragment-only traversal stays on the form. Browsers allow cancelling a
// traversal only once per user activation, so this event is not cancelable
// on a repeated Back press without interaction in between.
export function historyNavigationLeavesPage(navigation: HistoryNavigation): boolean {
  return navigation.navigationType === "traverse" && navigation.cancelable && !navigation.hashChange;
}
