"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  NativeSelect,
  NativeSelectOption,
} from "@/components/ui/native-select";
import { FormAlert } from "@/features/auth/components/form-alert";
import type { AuthorFormState, AuthorFormValues } from "@/features/authors/actions";
import { authorLimits, type AuthorField } from "@/features/authors/validation";

export type AccountChoice = { profileId: string; label: string; deactivated: boolean };

type AuthorFormProps = {
  action: (state: AuthorFormState, formData: FormData) => Promise<AuthorFormState>;
  submitLabel: string;
  initialValues?: Partial<AuthorFormValues>;
  // Present when editing: the record id and the loaded updated_at token.
  record?: { id: string; updatedAt: string };
  accountChoices: AccountChoice[];
};

const emptyValues: AuthorFormValues = { name: "", slug: "", bio: "", profileId: "" };

// Shared create/edit form. Slug may stay empty; the server derives it from the
// name. An empty account keeps the author a guest credit.
export function AuthorForm({
  action,
  submitLabel,
  initialValues,
  record,
  accountChoices,
}: AuthorFormProps) {
  const [state, formAction, pending] = useActionState(action, {
    status: "idle",
    message: null,
    fieldErrors: {},
  } satisfies AuthorFormState);
  const t = useTranslations("adminAuthors.form");
  const tForm = useTranslations("admin.form");

  const values = { ...emptyValues, ...initialValues, ...state.values };
  const prefix = record ? `author-${record.id}` : "author-new";
  const fieldId = (field: AuthorField) => `${prefix}-${field}`;
  const errorId = (field: AuthorField) => `${prefix}-${field}-error`;

  const fieldProps = (field: AuthorField) => ({
    id: fieldId(field),
    name: field,
    "aria-invalid": state.fieldErrors[field] ? true : undefined,
    "aria-describedby": state.fieldErrors[field] ? errorId(field) : undefined,
  });

  const fieldError = (field: AuthorField) =>
    state.fieldErrors[field] ? (
      <p id={errorId(field)} className="text-sm text-destructive">
        {state.fieldErrors[field]}
      </p>
    ) : null;

  return (
    // Remount after each failed submit so the kept values become defaults.
    <form key={JSON.stringify(state.values ?? null)} action={formAction} className="max-w-xl space-y-5">
      {record ? (
        <>
          <input type="hidden" name="id" value={record.id} />
          <input type="hidden" name="updatedAt" value={record.updatedAt} />
        </>
      ) : null}

      <div className="grid gap-5 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor={fieldId("name")}>{t("name")}</Label>
          <Input
            {...fieldProps("name")}
            defaultValue={values.name}
            maxLength={authorLimits.name}
            required
          />
          {fieldError("name")}
        </div>

        <div className="space-y-2">
          <Label htmlFor={fieldId("slug")}>{t("slug")}</Label>
          <Input
            {...fieldProps("slug")}
            defaultValue={values.slug}
            maxLength={authorLimits.slug}
            placeholder={t("slugPlaceholder")}
          />
          {fieldError("slug") ?? (
            <p className="text-xs text-muted-foreground">
              {record ? t("slugHintEdit") : t("slugHintNew")}
            </p>
          )}
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor={fieldId("bio")}>{t("bio")}</Label>
        <Textarea
          {...fieldProps("bio")}
          defaultValue={values.bio}
          maxLength={authorLimits.bio}
          rows={4}
        />
        {fieldError("bio") ?? (
          <p className="text-xs text-muted-foreground">
            {t("bioHint")}
          </p>
        )}
      </div>

      <div className="space-y-2">
        <Label htmlFor={fieldId("profileId")}>{t("account")}</Label>
        <NativeSelect
          className="w-full"
          {...fieldProps("profileId")}
          defaultValue={values.profileId}
        >
          <NativeSelectOption value="">{t("accountNone")}</NativeSelectOption>
          {accountChoices.map((choice) => (
            <NativeSelectOption key={choice.profileId} value={choice.profileId}>
              {choice.deactivated
                ? t("accountDeactivated", { label: choice.label })
                : choice.label}
            </NativeSelectOption>
          ))}
        </NativeSelect>
        {fieldError("profileId") ?? (
          <p className="text-xs text-muted-foreground">
            {t("accountHint")}
          </p>
        )}
      </div>

      {state.status === "error" && state.message ? (
        <FormAlert tone="error">{state.message}</FormAlert>
      ) : null}

      <Button type="submit" disabled={pending}>
        {pending ? tForm("saving") : submitLabel}
      </Button>
    </form>
  );
}
