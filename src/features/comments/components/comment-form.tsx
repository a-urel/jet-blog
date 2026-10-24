"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { signInPathFor } from "@/features/auth/return-path";
import { FormAlert } from "@/features/auth/components/form-alert";
import { createCommentAction } from "../actions";
import { commentBodyMaxLength, commentMessageKeys, normalizeCommentBody } from "../model";
import { useCommentViewer } from "./comment-viewer-provider";

type CommentFormProps = {
  postId: string;
};

// Submission refreshes the page through the action's revalidatePath, so the
// new comment appears in the server-rendered list right away; a toast confirms
// it. Errors stay inline, tied to the textarea.
export function CommentForm({ postId }: CommentFormProps) {
  const t = useTranslations("comments");
  const { status, hasDisplayName, markAnonymous } = useCommentViewer();
  const pathname = usePathname();
  const [body, setBody] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const length = [...body].length;

  if (status === "loading") {
    return <Skeleton className="h-32 w-full" aria-label={t("form.loading")} />;
  }

  if (status === "anonymous") {
    return (
      <p className="rounded-lg border px-4 py-3 text-sm text-muted-foreground">
        {t.rich("form.signInPrompt", {
          link: (chunks) => (
            <Link
              href={signInPathFor(pathname)}
              className="font-medium text-foreground underline underline-offset-4"
            >
              {chunks}
            </Link>
          ),
        })}
      </p>
    );
  }

  if (status === "error") {
    return (
      <FormAlert tone="error">
        {t("form.loadError")}
      </FormAlert>
    );
  }

  if (!hasDisplayName) {
    return (
      <p className="rounded-lg border px-4 py-3 text-sm text-muted-foreground">
        {t.rich("form.displayNamePrompt", {
          link: (chunks) => (
            <Link
              href="/account"
              className="font-medium text-foreground underline underline-offset-4"
            >
              {chunks}
            </Link>
          ),
        })}
      </p>
    );
  }

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    const normalized = normalizeCommentBody(body);
    if (!normalized.ok) {
      setError(t(`validation.${normalized.error}`, { max: String(commentBodyMaxLength) }));
      return;
    }

    startTransition(async () => {
      let result;
      try {
        result = await createCommentAction(postId, normalized.value);
      } catch {
        setError(t("messages.error"));
        return;
      }

      switch (result.status) {
        case "ok":
          setBody("");
          toast.success(t("form.published"));
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
          setError(t(`messages.${commentMessageKeys[result.status]}`));
      }
    });
  }

  return (
    <form onSubmit={submit} className="space-y-3" noValidate>
      <div className="space-y-2">
        <Label htmlFor="comment-body">{t("form.label")}</Label>
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
          {t("form.hint", {
            length: String(length),
            max: String(commentBodyMaxLength),
          })}
        </p>
      </div>
      {error ? (
        <FormAlert id="comment-form-error" tone="error">
          {error}
        </FormAlert>
      ) : null}
      <Button type="submit" disabled={pending}>
        {pending ? t("form.submitting") : t("form.submit")}
      </Button>
    </form>
  );
}
