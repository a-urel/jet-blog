import Link from "next/link";

import type { NavigationLink } from "../navigation";

// Header menu of the root layout (admin-edited, /admin/navigation). Server
// rendered from the cached menu, so public pages stay static.
export function SiteHeaderNav({ links, label }: { links: NavigationLink[]; label: string }) {
  if (links.length === 0) return null;

  return (
    <nav aria-label={label} className="w-full sm:w-auto">
      <ul className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
        {links.map((link) => (
          <li key={link.key}>
            <NavigationAnchor link={link} className="rounded-sm text-muted-foreground hover:text-foreground hover:underline underline-offset-4" />
          </li>
        ))}
      </ul>
    </nav>
  );
}

export function NavigationAnchor({ link, className }: { link: NavigationLink; className: string }) {
  return link.external ? (
    <a href={link.href} rel="noopener noreferrer" className={className}>
      {link.label}
    </a>
  ) : (
    <Link href={link.href} className={className}>
      {link.label}
    </Link>
  );
}
