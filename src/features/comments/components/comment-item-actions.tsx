"use client";

import { useId, useState, useTransition } from "react";
import { Flag, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { deleteOwnCommentAction, reportCommentAction } from "../actions";
import {
  commentMessages,
  commentReportReasonLabels,
  commentReportReasons,
  type CommentActionResult,
  type CommentReportReason,
} from "../model";
import { useCommentViewer } from "./comment-viewer-provider";

type CommentItemActionsProps = {
  commentId: string;
  authorName: string;
};

type Mode = "idle" | "confirm-delete" | "report";

function resultMessage(result: CommentActionResult): string | null {
  switch (result.status) {
    case "ok":
    case "unauthenticated":
      return null;
    case "invalid":
      return result.message;
    default:
      return commentMessages[result.status];
  }
}

// Signed-in readers report other people's comments once; authors delete their
// own (no editing). Anonymous visitors see no controls. Both choices ask for a
// second, explicit step so a single stray click changes nothing.
export function CommentItemActions({ commentId, authorName }: CommentItemActionsProps) {
  const { status, isOwn, isReported, markReported, markAnonymous } = useCommentViewer();
  const [mode, setMode] = useState<Mode>("idle");
  const [reason, setReason] = useState<CommentReportReason>("spam");
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const reasonGroupId = useId();

  if (status !== "ready") return null;

  function run(action: () => Promise<CommentActionResult>, onOk: () => void) {
    setMessage(null);
    startTransition(async () => {
      let result: CommentActionResult;
      try {
        result = await action();
      } catch {
        setMessage(commentMessages.error);
        return;
      }

      if (result.status === "ok") {
        setMode("idle");
        onOk();
        return;
      }

      if (result.status === "unauthenticated") {
        markAnonymous();
        return;
      }

      setMessage(resultMessage(result));
    });
  }

  const own = isOwn(commentId);

  if (own) {
    return (
      <div className="flex flex-wrap items-center gap-2">
        {mode === "confirm-delete" ? (
          <>
            <span className="text-sm">Yorumunuz kalıcı olarak silinsin mi?</span>
            <Button
              type="button"
              size="sm"
              variant="destructive"
              disabled={pending}
              onClick={() => run(() => deleteOwnCommentAction(commentId), () => {})}
            >
              {pending ? "Siliniyor…" : "Evet, sil"}
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              disabled={pending}
              onClick={() => setMode("idle")}
            >
              Vazgeç
            </Button>
          </>
        ) : (
          <Button
            type="button"
            size="sm"
            variant="ghost"
            onClick={() => setMode("confirm-delete")}
          >
            <Trash2 aria-hidden="true" />
            Sil<span className="sr-only">: kendi yorumunuz</span>
          </Button>
        )}
        <span role="status" aria-live="polite" className="text-xs text-destructive">
          {message}
        </span>
      </div>
    );
  }

  if (isReported(commentId)) {
    return (
      <p role="status" className="text-xs text-muted-foreground">
        Bu yorumu bildirdiniz. Editörler inceleyecek.
      </p>
    );
  }

  if (mode !== "report") {
    return (
      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" size="sm" variant="ghost" onClick={() => setMode("report")}>
          <Flag aria-hidden="true" />
          Bildir<span className="sr-only">: {authorName} adlı kişinin yorumu</span>
        </Button>
        <span role="status" aria-live="polite" className="text-xs text-destructive">
          {message}
        </span>
      </div>
    );
  }

  return (
    <form
      className="space-y-3 rounded-lg border p-3"
      onSubmit={(event) => {
        event.preventDefault();
        run(
          () => reportCommentAction(commentId, reason),
          () => markReported(commentId),
        );
      }}
    >
      <fieldset className="space-y-2">
        <legend id={reasonGroupId} className="text-sm font-medium">
          Bildirme nedeni
        </legend>
        <RadioGroup
          aria-labelledby={reasonGroupId}
          value={reason}
          onValueChange={(value) => setReason(value as CommentReportReason)}
        >
          {commentReportReasons.map((option) => {
            const id = `${reasonGroupId}-${option}`;
            return (
              <div key={option} className="flex items-center gap-2">
                <RadioGroupItem id={id} value={option} />
                <Label htmlFor={id} className="font-normal">
                  {commentReportReasonLabels[option]}
                </Label>
              </div>
            );
          })}
        </RadioGroup>
      </fieldset>
      <div className="flex flex-wrap items-center gap-2">
        <Button type="submit" size="sm" disabled={pending}>
          {pending ? "Gönderiliyor…" : "Bildir"}
        </Button>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          disabled={pending}
          onClick={() => setMode("idle")}
        >
          Vazgeç
        </Button>
        <span role="status" aria-live="polite" className="text-xs text-destructive">
          {message}
        </span>
      </div>
    </form>
  );
}
