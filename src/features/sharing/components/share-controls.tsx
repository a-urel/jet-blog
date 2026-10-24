import { ExternalLink } from "lucide-react";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import { buildShareLinks } from "../share-links";
import { CopyLinkButton } from "./copy-link-button";

// Server-rendered share links work without JavaScript; only copy-link needs
// the client. External links open in a new tab without a referrer or opener.
export function ShareControls({ url, title }: { url: string; title: string }) {
  const t = useTranslations("sharing");

  return (
    <section aria-labelledby="share-title" className="space-y-3">
      <h2 id="share-title" className="text-sm font-medium text-muted-foreground">
        {t("heading")}
      </h2>
      <div className="flex flex-wrap items-start gap-2">
        <CopyLinkButton url={url} />
        <ul className="flex flex-wrap gap-2">
          {buildShareLinks({ url, title, emailLabel: t("email") }).map((link) => (
            <li key={link.provider}>
              <Button asChild variant="ghost">
                {link.provider === "email" ? (
                  <a href={link.href}>
                    <span aria-hidden="true">{link.label}</span>
                    <span className="sr-only">{t("shareVia", { provider: link.label })}</span>
                  </a>
                ) : (
                  <a href={link.href} target="_blank" rel="noopener noreferrer">
                    <span aria-hidden="true">{link.label}</span>
                    <ExternalLink aria-hidden="true" />
                    <span className="sr-only">
                      {t("shareViaNewTab", { provider: link.label })}
                    </span>
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
