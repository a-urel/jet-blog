"use client";

import { useActionState, useEffect, useRef, useState, type ReactNode } from "react";
import { Trash2, Upload } from "lucide-react";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import { FormAlert } from "@/features/auth/components/form-alert";
import { avatarChangedEvent } from "../events";
import type { AvatarFormState } from "../form-state";
import { allowedAvatarTypes, avatarLimitValues } from "../validation";

type AvatarAction = (state: AvatarFormState, formData: FormData) => Promise<AvatarFormState>;

type AvatarFormProps = {
  // Server-rendered preview of the current avatar (or its initials).
  preview: ReactNode;
  hasAvatar: boolean;
  uploadAction: AvatarAction;
  removeAction: AvatarAction;
  // Extra fields both actions need, such as an author id and updated_at token.
  hiddenFields?: Record<string, string>;
  idPrefix: string;
};

const initialState: AvatarFormState = { status: "idle", message: null };

// Upload and removal for one avatar. The button opens the file picker and the
// upload starts as soon as a file is chosen, so there is no separate submit
// step. The server validates the file signature, type, size, and dimensions;
// accept only narrows the file picker.
export function AvatarForm({
  preview,
  hasAvatar,
  uploadAction,
  removeAction,
  hiddenFields = {},
  idPrefix,
}: AvatarFormProps) {
  const t = useTranslations("avatars.form");
  const [uploadState, upload, uploading] = useActionState(uploadAction, initialState);
  const [removeState, remove, removing] = useActionState(removeAction, initialState);
  const fileInput = useRef<HTMLInputElement>(null);
  // Both actions report into one place; show the one the user ran last.
  const [lastAction, setLastAction] = useState<"upload" | "remove">("upload");
  const pending = uploading || removing;
  const hintId = `${idPrefix}-avatar-hint`;
  const statusId = `${idPrefix}-avatar-status`;
  const state = lastAction === "upload" ? uploadState : removeState;

  // Each action returns a new state object, so this runs once per result.
  useEffect(() => {
    if (state.status === "success") window.dispatchEvent(new Event(avatarChangedEvent));
  }, [state]);

  const hidden = Object.entries(hiddenFields).map(([name, value]) => (
    <input key={name} type="hidden" name={name} value={value} />
  ));

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-4">
        {preview}
        <div className="flex flex-wrap gap-2">
          <form action={upload}>
            {hidden}
            <input
              ref={fileInput}
              name="avatar"
              type="file"
              accept={allowedAvatarTypes.join(",")}
              className="sr-only"
              tabIndex={-1}
              aria-hidden="true"
              onChange={(event) => {
                if (event.currentTarget.files?.length) {
                  setLastAction("upload");
                  event.currentTarget.form?.requestSubmit();
                }
              }}
            />
            <Button
              type="button"
              variant="outline"
              disabled={pending}
              aria-describedby={state.message ? `${hintId} ${statusId}` : hintId}
              onClick={() => fileInput.current?.click()}
            >
              <Upload aria-hidden="true" />
              {uploading ? t("uploading") : hasAvatar ? t("change") : t("choose")}
            </Button>
          </form>
          {hasAvatar ? (
            <form action={remove} onSubmit={() => setLastAction("remove")}>
              {hidden}
              <Button type="submit" variant="ghost" disabled={pending}>
                <Trash2 aria-hidden="true" />
                {removing ? t("removing") : t("remove")}
              </Button>
            </form>
          ) : null}
        </div>
      </div>

      <p id={hintId} className="text-sm text-muted-foreground">
        {t("hint", { maxMegabytes: avatarLimitValues.maxMegabytes })}
      </p>

      {state.message ? (
        <FormAlert id={statusId} tone={state.status === "error" ? "error" : "success"}>
          {state.message}
        </FormAlert>
      ) : null}
    </div>
  );
}
