"use client";

import { useRef } from "react";
import { EyeOff, RefreshCw, Send, Undo2 } from "lucide-react";
import { useTranslations } from "next-intl";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import {
  discardPostChangesAction,
  publishPostAction,
  republishPostAction,
  unpublishPostAction,
} from "@/features/posts/admin/actions";
import type { PublicationAction } from "@/features/posts/admin/publication";

const actions = {
  publish: publishPostAction,
  unpublish: unpublishPostAction,
  republish: republishPostAction,
  discard: discardPostChangesAction,
} satisfies Record<PublicationAction, (formData: FormData) => Promise<void>>;

const icons = {
  publish: Send,
  unpublish: EyeOff,
  republish: RefreshCw,
  discard: Undo2,
} satisfies Record<PublicationAction, unknown>;

// Unpublishing and discarding take something away; the others put it live.
const destructive: Record<PublicationAction, boolean> = {
  publish: false,
  unpublish: true,
  republish: false,
  discard: true,
};

type PublicationControlProps = {
  action: PublicationAction;
  postId: string;
  revision: number;
  title: string;
};

// A publication action (publish, unpublish, republish, discard changes) behind
// a confirmation dialog. The form carries the revision the page was rendered
// with, so the RPC's compare-and-swap still refuses a change made after the
// page loaded. The dialog content is portaled outside the form, so confirming
// submits it with requestSubmit() instead of relying on a submit button's form
// owner.
export function PublicationControl({
  action,
  postId,
  revision,
  title,
}: PublicationControlProps) {
  const formRef = useRef<HTMLFormElement>(null);
  const t = useTranslations("adminPosts");
  const Icon = icons[action];
  const variant = destructive[action] ? "destructive" : "default";

  return (
    <form ref={formRef} action={actions[action]}>
      <input type="hidden" name="postId" value={postId} />
      <input type="hidden" name="revision" value={revision} />
      <AlertDialog>
        <AlertDialogTrigger asChild>
          <Button
            type="button"
            variant={destructive[action] ? "outline" : "default"}
          >
            <Icon aria-hidden="true" />
            {t(`publication.${action}.trigger`)}
          </Button>
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t(`publication.${action}.title`)}</AlertDialogTitle>
            <AlertDialogDescription>
              {t(`publication.${action}.description`, { title })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("shared.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              variant={variant}
              onClick={() => formRef.current?.requestSubmit()}
            >
              {t(`publication.${action}.confirm`)}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </form>
  );
}
