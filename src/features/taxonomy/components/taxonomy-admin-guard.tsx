import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";

import { EditorialAccessDenied } from "@/features/auth/components/editorial-access-denied";
import { canManageTaxonomy, getEditorialContext } from "@/lib/auth/editorial";

// Renders the denial for signed-in non-admins; returns null for admins.
export async function taxonomyAccessDenial() {
  const { user, membership } = await getEditorialContext();
  if (!user) redirect("/login");

  if (canManageTaxonomy(membership)) return null;

  const t = await getTranslations("adminTaxonomy.denied");

  return (
    <EditorialAccessDenied
      title={t("title")}
      description={t("description")}
      email={user.email}
    />
  );
}
