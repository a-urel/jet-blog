import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";

import { EditorialAccessDenied } from "@/features/auth/components/editorial-access-denied";
import { canManageAuthors, getEditorialContext } from "@/lib/auth/editorial";

// Renders the denial for signed-in non-admins; returns null for admins.
export async function authorAccessDenial() {
  const { user, membership } = await getEditorialContext();
  if (!user) redirect("/login");

  if (canManageAuthors(membership)) return null;

  const t = await getTranslations("adminAuthors.denied");

  return (
    <EditorialAccessDenied
      title={t("title")}
      description={t("description")}
      email={user.email}
    />
  );
}
