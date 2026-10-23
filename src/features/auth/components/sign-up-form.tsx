"use client";

import { useActionState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { signUpAction, type SignUpState } from "@/features/auth/actions";
import {
  passwordMinLength,
  passwordPolicyHint,
} from "@/features/auth/password-policy";
import { displayNameMaxLength } from "@/features/auth/validation";
import { FormAlert } from "./form-alert";

const initialState: SignUpState = { status: "idle", message: null };

export function SignUpForm() {
  const [state, formAction, pending] = useActionState(
    signUpAction,
    initialState,
  );

  if (state.status === "success" && state.message) {
    return <FormAlert tone="success">{state.message}</FormAlert>;
  }

  const invalid = state.status === "error" ? true : undefined;
  const describedBy = state.status === "error" ? "sign-up-error" : undefined;

  return (
    <form action={formAction} className="space-y-5">
      <div className="space-y-2">
        <Label htmlFor="display-name">Görünen ad</Label>
        <Input
          id="display-name"
          name="displayName"
          autoComplete="nickname"
          maxLength={displayNameMaxLength}
          required
          aria-invalid={invalid}
          aria-describedby={describedBy}
        />
        <p className="text-xs text-muted-foreground">
          İleride yorumlarınızda bu ad görünecek. Daha sonra değiştirebilirsiniz.
        </p>
      </div>

      <div className="space-y-2">
        <Label htmlFor="email">E-posta</Label>
        <Input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          inputMode="email"
          required
          aria-invalid={invalid}
          aria-describedby={describedBy}
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="password">Parola</Label>
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete="new-password"
          minLength={passwordMinLength}
          required
          aria-invalid={invalid}
          aria-describedby={describedBy ? `${describedBy} password-hint` : "password-hint"}
        />
        <p id="password-hint" className="text-xs text-muted-foreground">
          {passwordPolicyHint}
        </p>
      </div>

      <div className="space-y-2">
        <Label htmlFor="confirm-password">Parola (tekrar)</Label>
        <Input
          id="confirm-password"
          name="confirmPassword"
          type="password"
          autoComplete="new-password"
          minLength={passwordMinLength}
          required
          aria-invalid={invalid}
          aria-describedby={describedBy}
        />
      </div>

      {state.status === "error" && state.message ? (
        <FormAlert id="sign-up-error" tone="error">
          {state.message}
        </FormAlert>
      ) : null}

      <Button type="submit" className="w-full" disabled={pending}>
        {pending ? "Hesap oluşturuluyor…" : "Hesap oluştur"}
      </Button>
    </form>
  );
}
