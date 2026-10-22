import "server-only";

import { createServerSupabaseClient } from "@/lib/supabase/server";

export type MediaListRow = {
  id: string;
  mimeType: string;
  sizeBytes: number;
  width: number;
  height: number;
  createdAt: string;
  uploadedBy: string | null;
};

// RLS limits rows to active editorial members; the media library is shared.
export async function listMedia(): Promise<{
  media: MediaListRow[];
  error: boolean;
}> {
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase
    .from("media")
    .select("id, mime_type, size_bytes, width, height, created_at, uploaded_by")
    .order("created_at", { ascending: false })
    .limit(200);

  if (error) return { media: [], error: true };

  return {
    media: (data ?? []).map((row) => ({
      id: row.id,
      mimeType: row.mime_type,
      sizeBytes: row.size_bytes,
      width: row.width,
      height: row.height,
      createdAt: row.created_at,
      uploadedBy: row.uploaded_by,
    })),
    error: false,
  };
}
