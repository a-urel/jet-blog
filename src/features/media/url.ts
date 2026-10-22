// Delivery URLs are derived from the media id at render time. The object path
// equals the media id (enforced by `media_object_path_is_id`), and the bucket
// is public per decision D4, so no signed URL is ever stored.

export const mediaBucket = "media";

export function mediaPublicPath(mediaId: string): string {
  return `/storage/v1/object/public/${mediaBucket}/${mediaId}`;
}

// Returns null when Supabase is not configured, so renderers can show a
// controlled placeholder instead of a broken request.
export function mediaPublicUrl(mediaId: string): string | null {
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  if (!base) return null;

  return `${base.replace(/\/+$/, "")}${mediaPublicPath(mediaId)}`;
}
