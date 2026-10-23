import { redirect } from "next/navigation";

import { EditorialAccessDenied } from "@/features/auth/components/editorial-access-denied";
import { canManageTaxonomy, getEditorialContext } from "@/lib/auth/editorial";

// Renders the denial for signed-in non-admins; returns null for admins.
export async function taxonomyAccessDenial() {
  const { user, membership } = await getEditorialContext();
  if (!user) redirect("/login");

  if (canManageTaxonomy(membership)) return null;

  return (
    <EditorialAccessDenied
      title="Kategori ve etiket yönetimi kapalı"
      description="Bu sayfa yalnızca admin rolüne açıktır. Editörler mevcut kategori ve etiketleri yazılara atayabilir."
      email={user.email}
    />
  );
}
