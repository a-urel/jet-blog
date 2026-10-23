"use client";

import { useActionState } from "react";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  deleteAccountAction,
  type DeleteAccountState,
} from "@/features/account/actions";
import { FormAlert } from "@/features/auth/components/form-alert";

const initialState: DeleteAccountState = { error: null };

export function DeleteAccountForm() {
  const [state, formAction, pending] = useActionState(
    deleteAccountAction,
    initialState,
  );

  return (
    <form action={formAction} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="delete-password">Parolanız</Label>
        <Input
          id="delete-password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          aria-invalid={state.error ? true : undefined}
          aria-describedby={state.error ? "delete-account-error" : undefined}
        />
      </div>

      <div className="flex items-start gap-3">
        <Checkbox id="confirm-delete" name="confirmDelete" required />
        <Label htmlFor="confirm-delete" className="leading-snug font-normal">
          Hesabımın kalıcı olarak silineceğini ve bu işlemin geri alınamayacağını
          anlıyorum.
        </Label>
      </div>

      {state.error ? (
        <FormAlert id="delete-account-error" tone="error">
          {state.error}
        </FormAlert>
      ) : null}

      <Button type="submit" variant="destructive" disabled={pending}>
        {pending ? "Siliniyor…" : "Hesabı kalıcı olarak sil"}
      </Button>
    </form>
  );
}
