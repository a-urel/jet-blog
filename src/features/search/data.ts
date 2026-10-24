import "server-only";

import type { PostLanguage } from "@/features/posts/language";
import {
  mapPublicPostSummary,
  publicPostSummaryColumns,
  type RawPublicPost,
} from "@/features/posts/mapping";
import { createPublicServerSupabaseClient } from "@/lib/supabase/server";
import { searchOffset, searchResultsPerPage } from "./query";
import { mapSearchRows, searchRowIds, type SearchPage } from "./results";

// Search runs per request and is never cached: the anonymous client opts out
// of the Data Cache, and /search is a dynamic route. Nothing here touches the
// public cache tags, so publishing changes need no extra invalidation: the
// next search reads the current rows.
function searchClient() {
  return createPublicServerSupabaseClient({ noStore: true });
}

// One page of published posts matching `query`, in rank order. The search
// function filters status = 'published' itself; the cards are then read
// through the anonymous client, so RLS (published only) filters again, and a
// post unpublished between the two reads simply drops out of the page.
export async function searchPublishedPosts(
  query: string,
  page: number,
  language: PostLanguage | null,
): Promise<SearchPage> {
  const supabase = searchClient();
  const { data, error } = await supabase.rpc("search_published_posts", {
    p_query: query,
    p_language: language,
    p_limit: searchResultsPerPage,
    p_offset: searchOffset(page),
  });

  if (error) throw new Error(`Search failed: ${error.message}`);

  const rows = (data ?? []) as unknown[];
  const ids = searchRowIds(rows);
  if (ids.length === 0) return mapSearchRows(rows, [], page);

  const { data: posts, error: postsError } = await supabase
    .from("posts")
    .select(publicPostSummaryColumns)
    .eq("status", "published")
    .in("id", ids);

  if (postsError) throw new Error(`Search results could not be loaded: ${postsError.message}`);

  const summaries = ((posts ?? []) as unknown as RawPublicPost[]).flatMap((row) => {
    const summary = mapPublicPostSummary(row);
    return summary ? [summary] : [];
  });

  return mapSearchRows(rows, summaries, page);
}
