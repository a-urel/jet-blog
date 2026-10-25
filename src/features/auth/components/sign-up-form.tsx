"use client";

import { useActionState, type ReactNode } from "react";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { signUpAction, type SignUpState } from "@/features/auth/actions";
import {
  passwordMinLength,
  passwordPolicyValues,
} from "@/features/auth/password-policy";
import { displayNameMaxLength } from "@/features/auth/validation";
import { FormAlert } from "./form-alert";

const initialState: SignUpState = { status: "idle", message: null };

// notice: the server-rendered privacy notice link (Phase 28), shown above
// the submit button.
export function SignUpForm({ notice }: { notice?: ReactNode }) {
  const t = useTranslations("auth");
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
        <Label htmlFor="display-name">{t("fields.displayName")}</Label>
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
          {t("signUp.displayNameHint")}
        </p>
      </div>

      <div className="space-y-2">
        <Label htmlFor="email">{t("fields.email")}</Label>
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
        <Label htmlFor="password">{t("fields.password")}</Label>
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
          {t("passwordPolicy.hint", passwordPolicyValues)}
        </p>
      </div>

      <div className="space-y-2">
        <Label htmlFor="confirm-password">{t("fields.confirmPassword")}</Label>
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

      {notice}

      <Button type="submit" className="w-full" disabled={pending}>
        {pending ? t("signUp.pending") : t("signUp.submit")}
      </Button>
    </form>
  );
}
