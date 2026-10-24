"use client";

import { useActionState, type ReactNode } from "react";
import { Trash2, Upload } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { FormAlert } from "@/features/auth/components/form-alert";
import type { AvatarFormState } from "../form-state";
import { allowedAvatarTypes, maxAvatarBytes } from "../validation";

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

// Upload and removal for one avatar. The server validates the file signature,
// type, size, and dimensions; accept only narrows the file picker.
export function AvatarForm({
  preview,
  hasAvatar,
  uploadAction,
  removeAction,
  hiddenFields = {},
  idPrefix,
}: AvatarFormProps) {
  const [uploadState, upload, uploading] = useActionState(uploadAction, initialState);
  const [removeState, remove, removing] = useActionState(removeAction, initialState);
  const pending = uploading || removing;
  const inputId = `${idPrefix}-avatar-file`;
  const hintId = `${idPrefix}-avatar-hint`;
  const statusId = `${idPrefix}-avatar-status`;

  const hidden = Object.entries(hiddenFields).map(([name, value]) => (
    <input key={name} type="hidden" name={name} value={value} />
  ));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-4">
        {preview}
        {hasAvatar ? (
          <form action={remove}>
            {hidden}
            <Button type="submit" variant="outline" disabled={pending}>
              <Trash2 aria-hidden="true" />
              {removing ? "Kaldırılıyor…" : "Fotoğrafı kaldır"}
            </Button>
          </form>
        ) : null}
      </div>

      {removeState.message ? (
        <FormAlert tone={removeState.status === "error" ? "error" : "success"}>
          {removeState.message}
        </FormAlert>
      ) : null}

      <form action={upload} className="space-y-3">
        {hidden}
        <div className="space-y-2">
          <Label htmlFor={inputId}>{hasAvatar ? "Yeni fotoğraf" : "Fotoğraf"}</Label>
          <Input
            id={inputId}
            name="avatar"
            type="file"
            accept={allowedAvatarTypes.join(",")}
            required
            aria-describedby={uploadState.message ? `${hintId} ${statusId}` : hintId}
            aria-invalid={uploadState.status === "error" ? true : undefined}
          />
          <p id={hintId} className="text-sm text-muted-foreground">
            JPEG, PNG veya WebP; en fazla {maxAvatarBytes / 1024 / 1024} MB. Kare
            olmayan görseller ortadan kırpılarak gösterilir.
          </p>
        </div>

        {uploadState.message ? (
          <FormAlert id={statusId} tone={uploadState.status === "error" ? "error" : "success"}>
            {uploadState.message}
          </FormAlert>
        ) : null}

        <Button type="submit" disabled={pending}>
          <Upload aria-hidden="true" />
          {uploading ? "Yükleniyor…" : "Yükle"}
        </Button>
      </form>
    </div>
  );
}
