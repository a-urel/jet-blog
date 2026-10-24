// Avatars live in their own public bucket, separate from post media. Object
// names are `<kind>/<uuid>`: the kind follows from the table that references
// the avatar (profiles.avatar_id or authors.avatar_id), and the UUID is fresh
// per upload, so a URL never names a user or an author and an object is never
// overwritten. Delivery URLs are derived at render time, like media.

export const avatarsBucket = "avatars";

export type AvatarKind = "profiles" | "authors";

export function avatarObjectName(kind: AvatarKind, avatarId: string): string {
  return `${kind}/${avatarId}`;
}

export function avatarPublicPath(kind: AvatarKind | "", avatarId = ""): string {
  const prefix = `/storage/v1/object/public/${avatarsBucket}/`;
  return kind ? `${prefix}${avatarObjectName(kind, avatarId)}` : prefix;
}

// Returns null when Supabase is not configured, so the avatar falls back to
// initials instead of a broken request.
export function avatarPublicUrl(kind: AvatarKind, avatarId: string): string | null {
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  if (!base) return null;

  return `${base.replace(/\/+$/, "")}${avatarPublicPath(kind, avatarId)}`;
}
