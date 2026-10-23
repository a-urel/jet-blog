"use client";

import { useActionState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  requestPasswordResetAction,
  type PasswordResetRequestState,
} from "@/features/auth/actions";
import { FormAlert } from "./form-alert";

const initialState: PasswordResetRequestState = {
  status: "idle",
  message: null,
};

export function PasswordResetRequestForm() {
  const [state, formAction, pending] = useActionState(
    requestPasswordResetAction,
    initialState,
  );

  if (state.status === "success" && state.message) {
    return <FormAlert tone="success">{state.message}</FormAlert>;
  }

  return (
    <form action={formAction} className="space-y-5">
      <div className="space-y-2">
        <Label htmlFor="email">E-posta</Label>
        <Input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          inputMode="email"
          required
          aria-invalid={state.status === "error" ? true : undefined}
          aria-describedby={state.status === "error" ? "reset-error" : undefined}
        />
      </div>

      {state.status === "error" && state.message ? (
        <FormAlert id="reset-error" tone="error">
          {state.message}
        </FormAlert>
      ) : null}

      <Button type="submit" className="w-full" disabled={pending}>
        {pending ? "Gönderiliyor…" : "Sıfırlama bağlantısı gönder"}
      </Button>
    </form>
  );
}
