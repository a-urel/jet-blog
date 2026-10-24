"use client";

import { useActionState, useEffect, useState } from "react";
import { CircleAlert } from "lucide-react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  NativeSelect,
  NativeSelectOption,
} from "@/components/ui/native-select";
import {
  inviteMemberAction,
  type InviteMemberState,
} from "@/features/members/actions";
import type { EditorialRole } from "@/lib/auth/editorial";

const initialState: InviteMemberState = { status: "idle", message: null };

const roleOptions: EditorialRole[] = ["author", "editor", "admin"];

export function InviteMemberForm() {
  const t = useTranslations("adminMembers.inviteForm");
  const tRoles = useTranslations("admin.roles");
  const [role, setRole] = useState<EditorialRole>("author");
  const [state, formAction, pending] = useActionState(
    inviteMemberAction,
    initialState,
  );

  // Each action returns a new state object, so this runs once per result.
  // Success is a toast; an error stays inline above the submit button.
  useEffect(() => {
    if (state.status === "success" && state.message) toast.success(state.message);
  }, [state]);

  return (
    <form action={formAction} className="max-w-xl space-y-5">
      <div className="space-y-2">
        <Label htmlFor="invite-email">{t("email")}</Label>
        <Input
          id="invite-email"
          name="email"
          type="email"
          autoComplete="email"
          inputMode="email"
          required
          aria-invalid={state.status === "error" ? true : undefined}
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="invite-display-name">{t("displayName")}</Label>
        <Input
          id="invite-display-name"
          name="displayName"
          type="text"
          maxLength={120}
          autoComplete="name"
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="invite-role">{t("role")}</Label>
        <NativeSelect
          className="w-full"
          id="invite-role"
          name="role"
          value={role}
          onChange={(event) => {
            const nextRole = event.target.value;
            if (
              nextRole === "admin" ||
              nextRole === "editor" ||
              nextRole === "author"
            ) {
              setRole(nextRole);
            }
          }}
        >
          {roleOptions.map((option) => (
            <NativeSelectOption key={option} value={option}>
              {tRoles(option)}
            </NativeSelectOption>
          ))}
        </NativeSelect>
      </div>

      {role === "admin" ? (
        <div className="flex items-start gap-3 rounded-lg border bg-muted/40 px-3 py-3">
          <input
            id="invite-confirm-admin"
            name="confirmAdmin"
            type="checkbox"
            className="mt-1 size-4"
          />
          <Label htmlFor="invite-confirm-admin" className="leading-6">
            {t("confirmAdmin")}
          </Label>
        </div>
      ) : null}

      {state.status === "error" && state.message ? (
        <p
          role="alert"
          className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive"
        >
          <CircleAlert aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
          {state.message}
        </p>
      ) : null}

      <Button type="submit" disabled={pending}>
        {pending ? t("sending") : t("submit")}
      </Button>
    </form>
  );
}
