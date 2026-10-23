import { ExternalLink } from "lucide-react";

import { Button } from "@/components/ui/button";
import { buildShareLinks } from "../share-links";
import { CopyLinkButton } from "./copy-link-button";

// Server-rendered share links work without JavaScript; only copy-link needs
// the client. External links open in a new tab without a referrer or opener.
export function ShareControls({ url, title }: { url: string; title: string }) {
  return (
    <section aria-labelledby="share-title" className="space-y-3">
      <h2 id="share-title" className="text-sm font-medium text-muted-foreground">
        Paylaş
      </h2>
      <div className="flex flex-wrap items-start gap-2">
        <CopyLinkButton url={url} />
        <ul className="flex flex-wrap gap-2">
          {buildShareLinks({ url, title }).map((link) => (
            <li key={link.provider}>
              <Button asChild variant="ghost">
                {link.provider === "email" ? (
                  <a href={link.href}>
                    {link.label}
                    <span className="sr-only"> ile paylaş</span>
                  </a>
                ) : (
                  <a href={link.href} target="_blank" rel="noopener noreferrer">
                    {link.label}
                    <ExternalLink aria-hidden="true" />
                    <span className="sr-only"> ile paylaş (yeni sekmede açılır)</span>
                  </a>
                )}
              </Button>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
