"use client";

import { createContext, use, useCallback, useEffect, useMemo, useState } from "react";

import { createBrowserAuthSupabaseClient } from "@/lib/supabase/client";

// Bookmark state is per user, while the pages that show the toggle (home,
// archives, /posts/[slug]) are ISR output shared by every visitor. The server
// therefore renders every toggle as "not saved", and this provider reads the
// signed-in user's rows in the browser after hydration. Nothing user-specific
// enters the prerendered HTML, the RSC payload, or the Data Cache.
//
// The read uses the cookie-backed browser client, so RLS (user_id =
// auth.uid()) is the authorization rule. The session check below only picks
// the UI path for a signed-out visitor; it grants nothing.

export type BookmarkStatus = "loading" | "anonymous" | "ready" | "error";

type BookmarkContextValue = {
  status: BookmarkStatus;
  isSaved: (postId: string) => boolean;
  setSaved: (postId: string, saved: boolean) => void;
  markAnonymous: () => void;
};

const BookmarkContext = createContext<BookmarkContextValue | null>(null);

export function useBookmarks(): BookmarkContextValue {
  const value = use(BookmarkContext);
  if (!value) throw new Error("useBookmarks must be used inside BookmarkProvider");
  return value;
}

type BookmarkProviderProps = {
  postIds: string[];
  // Known server-side (the private saved list): skip the browser read.
  initialSavedIds?: string[];
  children: React.ReactNode;
};

export function BookmarkProvider({
  postIds,
  initialSavedIds,
  children,
}: BookmarkProviderProps) {
  const [status, setStatus] = useState<BookmarkStatus>(
    initialSavedIds ? "ready" : "loading",
  );
  const [savedIds, setSavedIds] = useState<ReadonlySet<string>>(
    () => new Set(initialSavedIds ?? []),
  );
  const idsKey = postIds.join(",");

  useEffect(() => {
    if (initialSavedIds) return;

    let cancelled = false;
    const ids = idsKey ? idsKey.split(",") : [];

    async function load() {
      try {
        const supabase = createBrowserAuthSupabaseClient();
        const { data: sessionData } = await supabase.auth.getSession();

        if (!sessionData.session) {
          if (!cancelled) setStatus("anonymous");
          return;
        }

        if (ids.length === 0) {
          if (!cancelled) setStatus("ready");
          return;
        }

        const { data, error } = await supabase
          .from("bookmarks")
          .select("post_id")
          .in("post_id", ids);

        if (cancelled) return;
        if (error) {
          setStatus("error");
          return;
        }

        setSavedIds(new Set((data ?? []).map((row) => row.post_id as string)));
        setStatus("ready");
      } catch {
        if (!cancelled) setStatus("error");
      }
    }

    void load();

    return () => {
      cancelled = true;
    };
  }, [idsKey, initialSavedIds]);

  const isSaved = useCallback((postId: string) => savedIds.has(postId), [savedIds]);

  const setSaved = useCallback((postId: string, saved: boolean) => {
    setSavedIds((current) => {
      const next = new Set(current);
      if (saved) next.add(postId);
      else next.delete(postId);
      return next;
    });
    setStatus("ready");
  }, []);

  const markAnonymous = useCallback(() => {
    setSavedIds(new Set());
    setStatus("anonymous");
  }, []);

  const value = useMemo(
    () => ({ status, isSaved, setSaved, markAnonymous }),
    [status, isSaved, setSaved, markAnonymous],
  );

  return <BookmarkContext value={value}>{children}</BookmarkContext>;
}
