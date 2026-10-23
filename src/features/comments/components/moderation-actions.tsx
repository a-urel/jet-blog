"use client";

import { useState, useTransition } from "react";
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
// post page, so the row moves to its new filter after the refresh.
export function ModerationActions({ commentId, status }: ModerationActionsProps) {
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  if (status === "deleted") return null;

  function moderate(next: CommentStatus) {
    setMessage(null);
    startTransition(async () => {
      try {
        const result = await moderateCommentAction(commentId, next);
        if (result.status === "ok") {
          setConfirmDelete(false);
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
