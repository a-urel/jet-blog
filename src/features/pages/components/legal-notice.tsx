import Link from "next/link";
import { useTranslations } from "next-intl";

import { staticPagePath, type PageLink } from "../model";

// Informational privacy notice ("aydınlatma metni") under a form that
// collects personal data. KVKK and GDPR require informing people, not their
// consent, when processing is needed for the service they ask for (an
// account, a comment), so this is a link, not a consent checkbox. Renders
// nothing until a privacy page is published.
export function LegalNotice({
  context,
  privacyPage,
}: {
  context: "signUp" | "comment";
  privacyPage: PageLink | null;
}) {
  const t = useTranslations("pages.notice");
  if (!privacyPage) return null;

  return (
    <p className="text-xs text-muted-foreground">
      {t.rich(context, {
        link: (chunks) => (
          <Link
            href={staticPagePath(privacyPage.slug)}
            className="font-medium text-foreground underline underline-offset-4"
          >
            {chunks}
          </Link>
        ),
        title: privacyPage.title,
      })}
    </p>
  );
}
