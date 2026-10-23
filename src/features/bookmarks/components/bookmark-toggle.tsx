"use client";

import { useOptimistic, useState, useTransition } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Bookmark, BookmarkCheck } from "lucide-react";

import { Button } from "@/components/ui/button";
import { signInPathFor } from "@/features/auth/return-path";
import { cn } from "@/lib/utils";
import { setBookmarkAction } from "../actions";
import { bookmarkMessages } from "../result";
import { useBookmarks } from "./bookmark-provider";

type BookmarkToggleProps = {
  postId: string;
  // Card toggles name their post for screen readers; the post page does not
  // need to, because the toggle sits under the post's own heading.
  postTitle?: string;
  className?: string;
};

// A toggle button (aria-pressed) with a constant accessible name, as the
// WAI-ARIA button pattern recommends; the pressed state carries "saved".
// The optimistic state shows at once and settles on the Server Action's
// answer: the confirmed state on success, the previous state on failure.
export function BookmarkToggle({ postId, postTitle, className }: BookmarkToggleProps) {
  const { status, isSaved, setSaved, markAnonymous } = useBookmarks();
  const router = useRouter();
  const pathname = usePathname();
  const saved = isSaved(postId);
  const [optimisticSaved, setOptimisticSaved] = useOptimistic(saved);
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);

  function goToSignIn() {
    router.push(signInPathFor(pathname));
  }

  function toggle() {
    if (status === "anonymous") {
      goToSignIn();
      return;
    }

    const next = !optimisticSaved;
    setMessage(null);

    startTransition(async () => {
      setOptimisticSaved(next);

      let result;
      try {
        result = await setBookmarkAction(postId, next);
      } catch {
        setMessage(bookmarkMessages.error);
        return;
      }

      if (result.status === "ok") {
        setSaved(postId, result.saved);
        setMessage(result.saved ? "Yazı kaydedildi." : "Yazı kaydedilenlerden çıkarıldı.");
        return;
      }

      if (result.status === "unauthenticated") {
        markAnonymous();
        goToSignIn();
        return;
      }

      setMessage(bookmarkMessages[result.status]);
    });
  }

  const Icon = optimisticSaved ? BookmarkCheck : Bookmark;

  return (
    <span className={cn("inline-flex flex-col items-start gap-1", className)}>
      <Button
        type="button"
        variant={optimisticSaved ? "secondary" : "outline"}
        size="sm"
        aria-pressed={optimisticSaved}
        aria-busy={pending || undefined}
        onClick={toggle}
      >
        <Icon
          aria-hidden="true"
          className={cn(optimisticSaved && "fill-current")}
        />
        Kaydet
        {postTitle ? <span className="sr-only">: {postTitle}</span> : null}
      </Button>
      <span role="status" aria-live="polite" className="text-xs text-muted-foreground">
        {message}
      </span>
    </span>
  );
}
