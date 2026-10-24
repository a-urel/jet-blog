"use client";

import { useState, useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Eye, EyeOff, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { moderateCommentAction } from "../actions";
import { commentMessages, type CommentStatus } from "../model";

type ModerationActionsProps = {
  commentId: string;
  status: CommentStatus;
};

// Hide and restore are reversible and act at once; the soft delete is final,
// so it asks for a second click. The action revalidates the queue and the
// post page; on success the queue reloads with ?status=<new status>, which the
// page shows through QueryStatus, so the row leaves the list with a message.
export function ModerationActions({ commentId, status }: ModerationActionsProps) {
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  if (status === "deleted") return null;

  function moderate(next: CommentStatus) {
    setMessage(null);
    // An earlier success message no longer describes the latest action.
    const params = new URLSearchParams(searchParams);
    params.delete("status");
    window.history.replaceState(null, "", `${pathname}?${params.toString()}`);

    startTransition(async () => {
      try {
        const result = await moderateCommentAction(commentId, next);
        if (result.status === "ok") {
          setConfirmDelete(false);
          params.set("status", next);
          router.replace(`${pathname}?${params.toString()}`, { scroll: false });
          return;
        }
        setMessage(
          result.status === "invalid"
            ? result.message
            : result.status === "unauthenticated"
              ? "Oturum bulunamadı. Yeniden giriş yapın."
              : commentMessages[result.status],
        );
      } catch {
        setMessage(commentMessages.error);
      }
    });
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      {status === "visible" ? (
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={pending}
          onClick={() => moderate("hidden")}
        >
          <EyeOff aria-hidden="true" />
          Gizle
        </Button>
      ) : (
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={pending}
          onClick={() => moderate("visible")}
        >
          <Eye aria-hidden="true" />
          Yeniden göster
        </Button>
      )}
      {confirmDelete ? (
        <>
          <Button
            type="button"
            size="sm"
            variant="destructive"
            disabled={pending}
            onClick={() => moderate("deleted")}
          >
            Evet, sil
          </Button>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            disabled={pending}
            onClick={() => setConfirmDelete(false)}
          >
            Vazgeç
          </Button>
        </>
      ) : (
        <Button
          type="button"
          size="sm"
          variant="ghost"
          disabled={pending}
          onClick={() => setConfirmDelete(true)}
        >
          <Trash2 aria-hidden="true" />
          Sil
        </Button>
      )}
      <span role="status" aria-live="polite" className="text-xs text-destructive">
        {message}
      </span>
    </div>
  );
}
