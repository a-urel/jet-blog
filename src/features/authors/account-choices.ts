import type { AuthorAccountOption } from "./admin-data";

// Accounts an author form may offer: active members not linked to another
// author, plus the author's current account even if it was deactivated (the
// RPC keeps an unchanged link). The caller marks deactivated accounts in the
// interface language.
export function authorAccountChoices(
  options: readonly Pick<AuthorAccountOption, "profileId" | "label" | "deactivated">[],
  links: readonly { authorId: string; profileId: string | null }[],
  authorId?: string,
) {
  const linkedElsewhere = new Set(
    links
      .filter((link) => link.authorId !== authorId && link.profileId)
      .map((link) => link.profileId as string),
  );
  const current = links.find((link) => link.authorId === authorId)?.profileId ?? null;

  return options
    .filter((option) => option.profileId === current || !linkedElsewhere.has(option.profileId))
    .filter((option) => option.profileId === current || !option.deactivated)
    .map((option) => ({
      profileId: option.profileId,
      label: option.label,
      deactivated: option.deactivated,
    }));
}
