import { redirect } from "next/navigation";

import { EditorialAccessDenied } from "@/features/auth/components/editorial-access-denied";
import { canManageAuthors, getEditorialContext } from "@/lib/auth/editorial";

// Renders the denial for signed-in non-admins; returns null for admins.
export async function authorAccessDenial() {
  const { user, membership } = await getEditorialContext();
  if (!user) redirect("/login");

  if (canManageAuthors(membership)) return null;

  return (
    <EditorialAccessDenied
      title="Yazar yönetimi kapalı"
      description="Bu sayfa yalnızca admin rolüne açıktır. Editörler mevcut yazarları yazılara kredilendirebilir."
      email={user.email}
    />
  );
}
