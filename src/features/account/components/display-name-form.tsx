"use client";

import { useActionState, useEffect } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";

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
  const t = useTranslations("account.displayName");
  const [state, formAction, pending] = useActionState(updateDisplayNameAction, {
    status: "idle",
    message: null,
    value: displayName ?? "",
  } satisfies DisplayNameState);
  const error = state.status === "error" ? state.message : null;

  // Each action returns a new state object, so this runs once per result.
  // Success is a toast; an error stays inline, tied to the field.
  useEffect(() => {
    if (state.status === "success" && state.message) toast.success(state.message);
  }, [state]);

  return (
    <form action={formAction} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="display-name">{t("title")}</Label>
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
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? "display-name-status" : undefined}
        />
      </div>

      {error ? (
        <FormAlert id="display-name-status" tone="error">
          {error}
        </FormAlert>
      ) : null}

      <Button type="submit" disabled={pending}>
        {pending ? t("pending") : t("submit")}
      </Button>
    </form>
  );
}
