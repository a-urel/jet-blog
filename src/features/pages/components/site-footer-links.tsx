import type { NavigationLink } from "../navigation";
import { NavigationAnchor } from "./site-header-nav";

// Footer links of the root layout: the configured footer menu, or the
// published legal pages while none is configured (footerNavigationLinks).
export function SiteFooterLinks({ links, label }: { links: NavigationLink[]; label: string }) {
  if (links.length === 0) return null;

  return (
    <nav aria-label={label} className="w-full">
      <ul className="flex flex-wrap gap-x-4 gap-y-2">
        {links.map((link) => (
          <li key={link.key}>
            <NavigationAnchor link={link} className="rounded-sm hover:text-foreground hover:underline underline-offset-4" />
          </li>
        ))}
      </ul>
    </nav>
  );
}
