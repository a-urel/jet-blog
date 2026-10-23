"use client";

import { createContext, use, useCallback, useEffect, useMemo, useState } from "react";

import { createBrowserAuthSupabaseClient } from "@/lib/supabase/client";

// The comment list is part of the shared ISR post page, so it cannot say who
// is reading. This provider loads the visitor's own state after hydration:
// whether they are signed in, whether their profile has a display name (needed
// to comment), which visible comments are theirs (delete instead of report),
// and which comments they already reported. A new or removed comment changes
// the server-rendered id list, which reloads this state. Nothing user-specific enters the
// prerendered HTML or the Data Cache.
//
// Reads use the cookie-backed browser client: RLS and the security-definer
// list_own_comment_ids() scope every row to auth.uid(). The session check only
// picks the UI path; the Server Actions verify the user again.

export type CommentViewerStatus = "loading" | "anonymous" | "ready" | "error";

type CommentViewerContextValue = {
  status: CommentViewerStatus;
  hasDisplayName: boolean;
  isOwn: (commentId: string) => boolean;
  isReported: (commentId: string) => boolean;
  markReported: (commentId: string) => void;
  markAnonymous: () => void;
};

const CommentViewerContext = createContext<CommentViewerContextValue | null>(null);

export function useCommentViewer(): CommentViewerContextValue {
  const value = use(CommentViewerContext);
  if (!value) throw new Error("useCommentViewer must be used inside CommentViewerProvider");
  return value;
}

type CommentViewerProviderProps = {
  postId: string;
  commentIds: string[];
  children: React.ReactNode;
};

export function CommentViewerProvider({
  postId,
  commentIds,
  children,
}: CommentViewerProviderProps) {
  const [status, setStatus] = useState<CommentViewerStatus>("loading");
  const [hasDisplayName, setHasDisplayName] = useState(false);
  const [ownIds, setOwnIds] = useState<ReadonlySet<string>>(() => new Set());
  const [reportedIds, setReportedIds] = useState<ReadonlySet<string>>(() => new Set());
  const idsKey = commentIds.join(",");

  useEffect(() => {
    let cancelled = false;
    const ids = idsKey ? idsKey.split(",") : [];

    async function load() {
      try {
        const supabase = createBrowserAuthSupabaseClient();
        const { data: sessionData } = await supabase.auth.getSession();
        const userId = sessionData.session?.user.id;

        if (!userId) {
          if (!cancelled) setStatus("anonymous");
          return;
        }

        const [profile, own, reports] = await Promise.all([
          supabase.from("profiles").select("display_name").eq("id", userId).maybeSingle(),
          supabase.rpc("list_own_comment_ids", { p_post_id: postId }),
          ids.length > 0
            ? supabase.from("comment_reports").select("comment_id").in("comment_id", ids)
            : Promise.resolve({ data: [], error: null }),
        ]);

        if (cancelled) return;
        if (profile.error || own.error || reports.error) {
          setStatus("error");
          return;
        }

        setHasDisplayName(Boolean(profile.data?.display_name));
        setOwnIds(new Set((own.data ?? []) as string[]));
        setReportedIds(
          new Set((reports.data ?? []).map((row) => row.comment_id as string)),
        );
        setStatus("ready");
      } catch {
        if (!cancelled) setStatus("error");
      }
    }

    void load();

    return () => {
      cancelled = true;
    };
  }, [postId, idsKey]);

  const isOwn = useCallback((commentId: string) => ownIds.has(commentId), [ownIds]);
  const isReported = useCallback(
    (commentId: string) => reportedIds.has(commentId),
    [reportedIds],
  );

  const markReported = useCallback((commentId: string) => {
    setReportedIds((current) => new Set(current).add(commentId));
  }, []);

  const markAnonymous = useCallback(() => {
    setOwnIds(new Set());
    setReportedIds(new Set());
    setStatus("anonymous");
  }, []);

  const value = useMemo(
    () => ({
      status,
      hasDisplayName,
      isOwn,
      isReported,
      markReported,
      markAnonymous,
    }),
    [status, hasDisplayName, isOwn, isReported, markReported, markAnonymous],
  );

  return <CommentViewerContext value={value}>{children}</CommentViewerContext>;
}
