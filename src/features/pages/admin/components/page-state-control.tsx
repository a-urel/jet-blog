"use client";

import { useRef } from "react";
import { EyeOff, Send, Trash2 } from "lucide-react";
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
import { deletePageAction, publishPageAction, unpublishPageAction } from "../actions";

export type PageStateAction = "publish" | "unpublish" | "delete";

const actions = {
  publish: publishPageAction,
  unpublish: unpublishPageAction,
  delete: deletePageAction,
} satisfies Record<PageStateAction, (formData: FormData) => Promise<void>>;

const icons = { publish: Send, unpublish: EyeOff, delete: Trash2 } satisfies Record<
  PageStateAction,
  unknown
>;

// Publish, unpublish, or delete behind a confirmation dialog, like the post
// PublicationControl: the form carries the rendered revision, so the RPC's
// compare-and-swap refuses a change made after the page loaded, and the
// portaled dialog submits it with requestSubmit().
export function PageStateControl({
  action,
  pageId,
  revision,
  title,
}: {
  action: PageStateAction;
  pageId: string;
  revision: number;
  title: string;
}) {
  const formRef = useRef<HTMLFormElement>(null);
  const t = useTranslations("adminPages");
  const Icon = icons[action];
  const destructive = action !== "publish";

  return (
    <form ref={formRef} action={actions[action]}>
      <input type="hidden" name="pageId" value={pageId} />
      <input type="hidden" name="revision" value={revision} />
      <AlertDialog>
        <AlertDialogTrigger asChild>
          <Button type="button" variant={destructive ? "outline" : "default"}>
            <Icon aria-hidden="true" />
            {t(`stateActions.${action}.trigger`)}
          </Button>
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t(`stateActions.${action}.title`)}</AlertDialogTitle>
            <AlertDialogDescription>
              {t(`stateActions.${action}.description`, { title })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("form.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              variant={destructive ? "destructive" : "default"}
              onClick={() => formRef.current?.requestSubmit()}
            >
              {t(`stateActions.${action}.confirm`)}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </form>
  );
}
