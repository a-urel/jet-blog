"use client";

import {
  startTransition,
  useActionState,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { Trash2, Upload } from "lucide-react";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import { FormAlert } from "@/features/auth/components/form-alert";
import { CropSourceFailure, loadCropSource, type CropSource, type CropSourceError } from "../crop-image";
import { avatarChangedEvent } from "../events";
import type { AvatarFormState } from "../form-state";
import { allowedAvatarTypes } from "../validation";
import { AvatarCropDialog } from "./avatar-crop-dialog";

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

// The browser decodes these for cropping; the export is always WebP or JPEG,
// so a GIF becomes a static picture of its first frame.
const pickerTypes = [...allowedAvatarTypes, "image/gif"].join(",");

// Upload and removal for one avatar. The button opens the file picker; the
// chosen file opens the crop dialog, and saving uploads the cropped square, so
// there is no separate submit step. The server still validates the file
// signature, type, size, and dimensions; the crop and accept are conveniences.
export function AvatarForm({
  preview,
  hasAvatar,
  uploadAction,
  removeAction,
  hiddenFields = {},
  idPrefix,
}: AvatarFormProps) {
  const t = useTranslations("avatars.form");
  const tCrop = useTranslations("avatars.crop");
  const [uploadState, upload, uploading] = useActionState(uploadAction, initialState);
  const [removeState, remove, removing] = useActionState(removeAction, initialState);
  const fileInput = useRef<HTMLInputElement>(null);
  const uploadForm = useRef<HTMLFormElement>(null);
  const uploadButton = useRef<HTMLButtonElement>(null);
  const [cropSource, setCropSource] = useState<CropSource | null>(null);
  const [preparing, setPreparing] = useState(false);
  // Decoding or cropping failures happen before any action runs.
  const [cropError, setCropError] = useState<CropSourceError | null>(null);
  // Both actions report into one place; show the one the user ran last.
  const [lastAction, setLastAction] = useState<"upload" | "remove">("upload");
  const pending = uploading || removing || preparing;
  const hintId = `${idPrefix}-avatar-hint`;
  const statusId = `${idPrefix}-avatar-status`;
  const state = lastAction === "upload" ? uploadState : removeState;

  // Each action returns a new state object, so this runs once per result.
  useEffect(() => {
    if (state.status === "success") window.dispatchEvent(new Event(avatarChangedEvent));
  }, [state]);

  const chooseFile = async (file: File) => {
    setCropError(null);
    setPreparing(true);
    try {
      setCropSource(await loadCropSource(file));
    } catch (error) {
      setCropError(error instanceof CropSourceFailure ? error.reason : "decodeFailed");
    } finally {
      setPreparing(false);
    }
  };

  const uploadCropped = (file: File) => {
    setCropSource(null);
    if (!uploadForm.current) return;
    // The form supplies the hidden fields; the cropped file replaces the pick.
    const formData = new FormData(uploadForm.current);
    formData.set("avatar", file);
    setLastAction("upload");
    startTransition(() => upload(formData));
  };

  const message = cropError ? tCrop(cropError) : state.message;
  const tone = cropError || state.status === "error" ? "error" : "success";

  const hidden = Object.entries(hiddenFields).map(([name, value]) => (
    <input key={name} type="hidden" name={name} value={value} />
  ));

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-4">
        {preview}
        <div className="flex flex-wrap gap-2">
          {/* Never submitted natively: it only collects the hidden fields
              for the cropped upload. */}
          <form ref={uploadForm}>
            {hidden}
            <input
              ref={fileInput}
              name="avatar"
              type="file"
              accept={pickerTypes}
              className="sr-only"
              tabIndex={-1}
              aria-hidden="true"
              onChange={(event) => {
                const file = event.currentTarget.files?.[0];
                // Clear the pick so choosing the same file again reopens the crop.
                event.currentTarget.value = "";
                if (file) void chooseFile(file);
              }}
            />
            <Button
              ref={uploadButton}
              type="button"
              variant="outline"
              disabled={pending}
              aria-describedby={message ? `${hintId} ${statusId}` : hintId}
              onClick={() => fileInput.current?.click()}
            >
              <Upload aria-hidden="true" />
              {uploading
                ? t("uploading")
                : preparing
                  ? t("preparing")
                  : hasAvatar
                    ? t("change")
                    : t("choose")}
            </Button>
          </form>
          {hasAvatar ? (
            <form
              action={remove}
              onSubmit={() => {
                setCropError(null);
                setLastAction("remove");
              }}
            >
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
        {t("hint")}
      </p>

      {message ? (
        <FormAlert id={statusId} tone={tone}>
          {message}
        </FormAlert>
      ) : null}

      <AvatarCropDialog
        source={cropSource}
        onCancel={() => setCropSource(null)}
        onSave={uploadCropped}
        returnFocusRef={uploadButton}
      />
    </div>
  );
}
