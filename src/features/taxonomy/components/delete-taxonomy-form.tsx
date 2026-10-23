"use client";

import { useActionState } from "react";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import {
  NativeSelect,
  NativeSelectOption,
} from "@/components/ui/native-select";
import { FormAlert } from "@/features/auth/components/form-alert";
import type { TaxonomyDeleteState } from "@/features/taxonomy/actions";

type TargetOption = { id: string; name: string; depth: number };

type DeleteTaxonomyFormProps = {
  action: (state: TaxonomyDeleteState, formData: FormData) => Promise<TaxonomyDeleteState>;
  record: { id: string; updatedAt: string };
  confirmLabel: string;
  // Categories with posts must name a target; tags have none.
  targetOptions?: TargetOption[];
  targetRequired?: boolean;
};

export function DeleteTaxonomyForm({
  action,
  record,
  confirmLabel,
  targetOptions,
  targetRequired = false,
}: DeleteTaxonomyFormProps) {
  const [state, formAction, pending] = useActionState(action, {
    error: null,
  } satisfies TaxonomyDeleteState);
  const confirmId = `delete-confirm-${record.id}`;
  const targetId = `delete-target-${record.id}`;

  return (
    <form action={formAction} className="max-w-xl space-y-4">
      <input type="hidden" name="id" value={record.id} />
      <input type="hidden" name="updatedAt" value={record.updatedAt} />

      {targetOptions ? (
        <div className="space-y-2">
          <Label htmlFor={targetId}>
            {targetRequired ? "Yazıların taşınacağı kategori" : "Eski adresin yönleneceği kategori"}
          </Label>
          <NativeSelect
            className="w-full"
            id={targetId}
            name="targetCategoryId"
            required={targetRequired}
            defaultValue=""
          >
            <NativeSelectOption value="">{targetRequired ? "Kategori seçin" : "Yok (eski adres 404 olur)"}</NativeSelectOption>
            {targetOptions.map((option) => (
              <NativeSelectOption key={option.id} value={option.id}>
                {`${"— ".repeat(option.depth)}${option.name}`}
              </NativeSelectOption>
            ))}
          </NativeSelect>
        </div>
      ) : null}

      <div className="flex items-start gap-3">
        <Checkbox id={confirmId} name="confirmDelete" required />
        <Label htmlFor={confirmId} className="leading-snug font-normal">
          {confirmLabel}
        </Label>
      </div>

      {state.error ? <FormAlert tone="error">{state.error}</FormAlert> : null}

      <Button type="submit" variant="destructive" disabled={pending}>
        {pending ? "Siliniyor…" : "Sil"}
      </Button>
    </form>
  );
}
