"use client";

import { useActionState } from "react";
import { CircleAlert } from "lucide-react";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  updatePasswordAction,
  type UpdatePasswordState,
} from "@/features/auth/actions";
import {
  passwordMinLength,
  passwordPolicyValues,
} from "@/features/auth/password-policy";

const initialState: UpdatePasswordState = { error: null };

export function UpdatePasswordForm() {
  const t = useTranslations("auth");
  const [state, formAction, pending] = useActionState(
    updatePasswordAction,
    initialState,
  );

  return (
    <form action={formAction} className="space-y-5">
      <div className="space-y-2">
        <Label htmlFor="new-password">{t("fields.newPassword")}</Label>
        <Input
          id="new-password"
          name="password"
          type="password"
          autoComplete="new-password"
          minLength={passwordMinLength}
          required
          aria-invalid={state.error ? true : undefined}
          aria-describedby={state.error ? "password-error" : undefined}
        />
        <p className="text-xs text-muted-foreground">{t("passwordPolicy.hint", passwordPolicyValues)}</p>
      </div>

      <div className="space-y-2">
        <Label htmlFor="confirm-password">{t("fields.confirmNewPassword")}</Label>
        <Input
          id="confirm-password"
          name="confirmPassword"
          type="password"
          autoComplete="new-password"
          minLength={passwordMinLength}
          required
          aria-invalid={state.error ? true : undefined}
          aria-describedby={state.error ? "password-error" : undefined}
        />
      </div>

      {state.error ? (
        <p
          id="password-error"
          role="alert"
          className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive"
        >
          <CircleAlert aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
          {state.error}
        </p>
      ) : null}

      <Button type="submit" className="w-full" disabled={pending}>
        {pending ? t("passwordForm.pending") : t("passwordForm.submit")}
      </Button>
    </form>
  );
}
