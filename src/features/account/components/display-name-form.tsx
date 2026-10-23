"use client";

import { useActionState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  updateDisplayNameAction,
  type DisplayNameState,
} from "@/features/account/actions";
import { FormAlert } from "@/features/auth/components/form-alert";
import { displayNameMaxLength } from "@/features/auth/validation";

export function DisplayNameForm({ displayName }: { displayName: string | null }) {
  const [state, formAction, pending] = useActionState(updateDisplayNameAction, {
    status: "idle",
    message: null,
    value: displayName ?? "",
  } satisfies DisplayNameState);

  return (
    <form action={formAction} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="display-name">Görünen ad</Label>
        <Input
          // Remount with the saved value after each action so React's form
          // reset does not show a stale default.
          key={state.value}
          id="display-name"
          name="displayName"
          autoComplete="nickname"
          defaultValue={state.value}
          maxLength={displayNameMaxLength}
          required
          aria-invalid={state.status === "error" ? true : undefined}
          aria-describedby={state.message ? "display-name-status" : undefined}
        />
      </div>

      {state.message ? (
        <FormAlert
          id="display-name-status"
          tone={state.status === "error" ? "error" : "success"}
        >
          {state.message}
        </FormAlert>
      ) : null}

      <Button type="submit" disabled={pending}>
        {pending ? "Kaydediliyor…" : "Kaydet"}
      </Button>
    </form>
  );
}
