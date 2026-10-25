import type { EditorialMembership } from "@/lib/auth/editorial";

// D1 fit for pages (Phase 28): pages are publication-level content (legal
// texts, About), so editors and admins create, edit, publish, and delete them
// and edit the menus; authors have no page access. require_page_editor() in
// the database enforces the same rule.
export function canManagePages(membership: EditorialMembership | null): boolean {
  return membership?.role === "admin" || membership?.role === "editor";
}
