"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { signInPathFor } from "@/features/auth/return-path";
import { FormAlert } from "@/features/auth/components/form-alert";
import { createCommentAction } from "../actions";
import { commentBodyMaxLength, commentMessages, normalizeCommentBody } from "../model";
import { useCommentViewer } from "./comment-viewer-provider";

type CommentFormProps = {
  postId: string;
};

// Submission refreshes the page through the action's revalidatePath, so the
// new comment appears in the server-rendered list right away.
export function CommentForm({ postId }: CommentFormProps) {
  const { status, hasDisplayName, markAnonymous } = useCommentViewer();
  const pathname = usePathname();
  const [body, setBody] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const length = [...body].length;

  if (status === "loading") {
    return <Skeleton className="h-32 w-full" aria-label="Yorum formu yükleniyor" />;
  }

  if (status === "anonymous") {
    return (
      <p className="rounded-lg border px-4 py-3 text-sm text-muted-foreground">
        Yorum yazmak için{" "}
        <Link
          href={signInPathFor(pathname)}
          className="font-medium text-foreground underline underline-offset-4"
        >
          giriş yapın
        </Link>
        .
      </p>
    );
  }

  if (status === "error") {
    return (
      <FormAlert tone="error">
        Yorum formu yüklenemedi. Sayfayı yenileyip tekrar deneyin.
      </FormAlert>
    );
  }

  if (!hasDisplayName) {
    return (
      <p className="rounded-lg border px-4 py-3 text-sm text-muted-foreground">
        Yorum yazmadan önce{" "}
        <Link
          href="/account"
          className="font-medium text-foreground underline underline-offset-4"
        >
          hesabınızda bir görünen ad belirleyin
        </Link>
        . Yorumlarınız bu adla görünür.
      </p>
    );
  }

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setNotice(null);

    const normalized = normalizeCommentBody(body);
    if (!normalized.ok) {
      setError(normalized.message);
      return;
    }

    startTransition(async () => {
      let result;
      try {
        result = await createCommentAction(postId, normalized.value);
      } catch {
        setError(commentMessages.error);
        return;
      }

      switch (result.status) {
        case "ok":
          setBody("");
          setNotice("Yorumunuz yayımlandı.");
          return;
        case "unauthenticated":
          markAnonymous();
          return;
        case "invalid":
          setError(result.message);
          return;
        case "display-name-required":
        case "unavailable":
        case "duplicate":
        case "rate-limited":
        case "forbidden":
        case "error":
          setError(commentMessages[result.status]);
      }
    });
  }

  return (
    <form onSubmit={submit} className="space-y-3" noValidate>
      <div className="space-y-2">
        <Label htmlFor="comment-body">Yorumunuz</Label>
        <Textarea
          id="comment-body"
          name="body"
          value={body}
          onChange={(event) => setBody(event.target.value)}
          rows={4}
          required
          aria-invalid={error ? true : undefined}
          aria-describedby={
            error ? "comment-body-hint comment-form-error" : "comment-body-hint"
          }
        />
        <p id="comment-body-hint" className="text-xs text-muted-foreground">
          Düz metin; bağlantılar ve biçimlendirme işlenmez. {length}/
          {commentBodyMaxLength} karakter.
        </p>
      </div>
      {error ? (
        <FormAlert id="comment-form-error" tone="error">
          {error}
        </FormAlert>
      ) : null}
      {notice ? <FormAlert tone="success">{notice}</FormAlert> : null}
      <Button type="submit" disabled={pending}>
        {pending ? "Gönderiliyor…" : "Yorumu gönder"}
      </Button>
    </form>
  );
}
