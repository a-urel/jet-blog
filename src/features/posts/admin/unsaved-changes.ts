export const unsavedChangesMessage =
  "Kaydedilmemiş değişiklikleriniz var. Sayfadan ayrılırsanız bu değişiklikler kaybolacak.";

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
