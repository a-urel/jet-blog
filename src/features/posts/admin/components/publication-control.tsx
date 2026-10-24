"use client";

import { useRef } from "react";
import { EyeOff, Send } from "lucide-react";

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
  publishPostAction,
  unpublishPostAction,
} from "@/features/posts/admin/actions";
import { publicationConfirmation } from "@/features/posts/admin/publication";

type PublicationControlProps = {
  postId: string;
  revision: number;
  published: boolean;
  title: string;
};

// Publish and unpublish behind a confirmation dialog. The form carries the
// revision the page was rendered with, so the RPC's compare-and-swap still
// refuses a change made after the page loaded. The dialog content is portaled
// outside the form, so confirming submits it with requestSubmit() instead of
// relying on a submit button's form owner.
export function PublicationControl({
  postId,
  revision,
  published,
  title,
}: PublicationControlProps) {
  const formRef = useRef<HTMLFormElement>(null);
  const copy = publicationConfirmation(published, title);

  return (
    <form
      ref={formRef}
      action={published ? unpublishPostAction : publishPostAction}
    >
      <input type="hidden" name="postId" value={postId} />
      <input type="hidden" name="revision" value={revision} />
      <AlertDialog>
        <AlertDialogTrigger asChild>
          <Button type="button" variant={published ? "outline" : "default"}>
            {published ? <EyeOff aria-hidden="true" /> : <Send aria-hidden="true" />}
            {copy.trigger}
          </Button>
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{copy.title}</AlertDialogTitle>
            <AlertDialogDescription>{copy.description}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Vazgeç</AlertDialogCancel>
            <AlertDialogAction
              variant={published ? "destructive" : "default"}
              onClick={() => formRef.current?.requestSubmit()}
            >
              {copy.confirm}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </form>
  );
}
