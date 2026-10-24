"use client";

import { useState, useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Eye, EyeOff, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import { moderateCommentAction } from "../actions";
import { commentMessageKeys, type CommentStatus } from "../model";

type ModerationActionsProps = {
  commentId: string;
  status: CommentStatus;
};

// Hide and restore are reversible and act at once; the soft delete is final,
// so it asks for a second click. The action revalidates the queue and the
// post page; on success the queue reloads with ?status=<new status>, which the
// page confirms with a toast (QueryStatusToast) as the row leaves the list.
export function ModerationActions({ commentId, status }: ModerationActionsProps) {
  const t = useTranslations("adminComments.actions");
  const tComments = useTranslations("comments.messages");
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
              ? t("unauthenticated")
              : tComments(commentMessageKeys[result.status]),
        );
      } catch {
        setMessage(tComments("error"));
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
          {t("hide")}
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
          {t("restore")}
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
            {t("confirmDelete")}
          </Button>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            disabled={pending}
            onClick={() => setConfirmDelete(false)}
          >
            {t("cancel")}
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
          {t("delete")}
        </Button>
      )}
      <span role="status" aria-live="polite" className="text-xs text-destructive">
        {message}
      </span>
    </div>
  );
}
