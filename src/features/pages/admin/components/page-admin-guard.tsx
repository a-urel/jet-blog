import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";

import { EditorialAccessDenied } from "@/features/auth/components/editorial-access-denied";
import { getEditorialContext } from "@/lib/auth/editorial";
import { canManagePages } from "../../permissions";

// Renders the denial for signed-in members without page access (authors);
// returns null for editors and admins.
export async function pageAccessDenial() {
  const { user, membership } = await getEditorialContext();
  if (!user) redirect("/login");

  if (canManagePages(membership)) return null;

  const t = await getTranslations("adminPages.denied");

  return <EditorialAccessDenied title={t("title")} description={t("description")} email={user.email} />;
}
