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
import type {
  TaxonomyFormState,
  TaxonomyFormValues,
} from "@/features/taxonomy/actions";
import { taxonomyLimits, type TaxonomyField } from "@/features/taxonomy/validation";

type ParentOption = { id: string; name: string; depth: number };

type TaxonomyFormProps = {
  kind: "category" | "tag";
  action: (state: TaxonomyFormState, formData: FormData) => Promise<TaxonomyFormState>;
  submitLabel: string;
  initialValues?: Partial<TaxonomyFormValues>;
  // Present when editing: the record id and the loaded updated_at token.
  record?: { id: string; updatedAt: string };
  parentOptions?: ParentOption[];
};

const emptyValues: TaxonomyFormValues = {
  name: "",
  slug: "",
  description: "",
  parentId: "",
  sortOrder: "0",
};

// Shared create/edit form for categories and tags. Slug may stay empty; the
// server derives it from the name.
export function TaxonomyForm({
  kind,
  action,
  submitLabel,
  initialValues,
  record,
  parentOptions,
}: TaxonomyFormProps) {
  const [state, formAction, pending] = useActionState(action, {
    status: "idle",
    message: null,
    fieldErrors: {},
  } satisfies TaxonomyFormState);
  const t = useTranslations("adminTaxonomy.form");
  const tForm = useTranslations("admin.form");

  const values = { ...emptyValues, ...initialValues, ...state.values };
  const limits = kind === "category" ? taxonomyLimits.category : taxonomyLimits.tag;
  const prefix = record ? `${kind}-${record.id}` : `${kind}-new`;
  const fieldId = (field: TaxonomyField) => `${prefix}-${field}`;
  const errorId = (field: TaxonomyField) => `${prefix}-${field}-error`;

  const fieldProps = (field: TaxonomyField) => ({
    id: fieldId(field),
    name: field,
    "aria-invalid": state.fieldErrors[field] ? true : undefined,
    "aria-describedby": state.fieldErrors[field] ? errorId(field) : undefined,
  });

  const fieldError = (field: TaxonomyField) =>
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
            maxLength={limits.name}
            required
          />
          {fieldError("name")}
        </div>

        <div className="space-y-2">
          <Label htmlFor={fieldId("slug")}>{t("slug")}</Label>
          <Input
            {...fieldProps("slug")}
            defaultValue={values.slug}
            maxLength={limits.slug}
            placeholder={t("slugPlaceholder")}
          />
          {fieldError("slug") ?? (
            <p className="text-xs text-muted-foreground">
              {record ? t("slugHintEdit") : t("slugHintNew")}
            </p>
          )}
        </div>
      </div>

      {kind === "category" ? (
        <div className="grid gap-5 sm:grid-cols-[minmax(0,1fr)_8rem]">
          <div className="space-y-2">
            <Label htmlFor={fieldId("parentId")}>{t("parent")}</Label>
            <NativeSelect
              className="w-full"
              {...fieldProps("parentId")}
              defaultValue={values.parentId}
            >
              <NativeSelectOption value="">{t("parentNone")}</NativeSelectOption>
              {(parentOptions ?? []).map((option) => (
                <NativeSelectOption key={option.id} value={option.id}>
                  {`${"— ".repeat(option.depth)}${option.name}`}
                </NativeSelectOption>
              ))}
            </NativeSelect>
            {fieldError("parentId")}
          </div>

          <div className="space-y-2">
            <Label htmlFor={fieldId("sortOrder")}>{t("sortOrder")}</Label>
            <Input
              {...fieldProps("sortOrder")}
              type="number"
              inputMode="numeric"
              min={taxonomyLimits.sortOrder.min}
              max={taxonomyLimits.sortOrder.max}
              step={1}
              defaultValue={values.sortOrder}
            />
            {fieldError("sortOrder")}
          </div>
        </div>
      ) : null}

      <div className="space-y-2">
        <Label htmlFor={fieldId("description")}>{t("description")}</Label>
        <Textarea
          {...fieldProps("description")}
          defaultValue={values.description}
          maxLength={taxonomyLimits.description}
          rows={3}
        />
        {fieldError("description") ?? (
          <p className="text-xs text-muted-foreground">
            {t("descriptionHint")}
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
