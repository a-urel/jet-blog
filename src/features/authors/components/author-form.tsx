"use client";

import { useActionState } from "react";

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

export type AccountChoice = { profileId: string; label: string };

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
          <Label htmlFor={fieldId("name")}>Ad</Label>
          <Input
            {...fieldProps("name")}
            defaultValue={values.name}
            maxLength={authorLimits.name}
            required
          />
          {fieldError("name")}
        </div>

        <div className="space-y-2">
          <Label htmlFor={fieldId("slug")}>Slug</Label>
          <Input
            {...fieldProps("slug")}
            defaultValue={values.slug}
            maxLength={authorLimits.slug}
            placeholder="Boş bırakılırsa addan üretilir"
          />
          {fieldError("slug") ?? (
            <p className="text-xs text-muted-foreground">
              {record
                ? "Slug değişirse eski yazar adresi yeni adrese yönlenir."
                : "Küçük harf, rakam ve tire."}
            </p>
          )}
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor={fieldId("bio")}>Biyografi</Label>
        <Textarea
          {...fieldProps("bio")}
          defaultValue={values.bio}
          maxLength={authorLimits.bio}
          rows={4}
        />
        {fieldError("bio") ?? (
          <p className="text-xs text-muted-foreground">
            İsteğe bağlı. Yazar sayfasında ve arama sonuçlarında görünür.
          </p>
        )}
      </div>

      <div className="space-y-2">
        <Label htmlFor={fieldId("profileId")}>Bağlı hesap</Label>
        <NativeSelect
          className="w-full"
          {...fieldProps("profileId")}
          defaultValue={values.profileId}
        >
          <NativeSelectOption value="">Yok (misafir yazar)</NativeSelectOption>
          {accountChoices.map((choice) => (
            <NativeSelectOption key={choice.profileId} value={choice.profileId}>
              {choice.label}
            </NativeSelectOption>
          ))}
        </NativeSelect>
        {fieldError("profileId") ?? (
          <p className="text-xs text-muted-foreground">
            Yalnızca editoryal üyeler bağlanabilir. Bağlantı yetki vermez; düzenleme
            hakları üyelik rolünden gelir.
          </p>
        )}
      </div>

      {state.status === "error" && state.message ? (
        <FormAlert tone="error">{state.message}</FormAlert>
      ) : null}

      <Button type="submit" disabled={pending}>
        {pending ? "Kaydediliyor…" : submitLabel}
      </Button>
    </form>
  );
}
