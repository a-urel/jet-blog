"use client";

import { useActionState, useState } from "react";
import { CircleAlert, CircleCheck } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  inviteMemberAction,
  type InviteMemberState,
} from "@/features/members/actions";
import type { EditorialRole } from "@/lib/auth/editorial";

const initialState: InviteMemberState = { status: "idle", message: null };

const roleOptions: { value: EditorialRole; label: string }[] = [
  { value: "author", label: "Yazar" },
  { value: "editor", label: "Editör" },
  { value: "admin", label: "Admin" },
];

export function InviteMemberForm() {
  const [role, setRole] = useState<EditorialRole>("author");
  const [state, formAction, pending] = useActionState(
    inviteMemberAction,
    initialState,
  );

  return (
    <form action={formAction} className="space-y-5">
      <div className="space-y-2">
        <Label htmlFor="invite-email">E-posta</Label>
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
        <Label htmlFor="invite-display-name">Görünen ad (isteğe bağlı)</Label>
        <Input
          id="invite-display-name"
          name="displayName"
          type="text"
          maxLength={120}
          autoComplete="name"
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="invite-role">Rol</Label>
        <select
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
          className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 dark:bg-input/30"
        >
          {roleOptions.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
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
            Bu kişiye admin yetkisi vermeyi onaylıyorum.
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

      {state.status === "success" && state.message ? (
        <p
          role="status"
          className="flex items-start gap-2 rounded-lg border border-emerald-600/30 bg-emerald-600/10 px-3 py-2 text-sm text-emerald-800 dark:text-emerald-300"
        >
          <CircleCheck aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
          {state.message}
        </p>
      ) : null}

      <Button type="submit" disabled={pending}>
        {pending ? "Gönderiliyor…" : "Davet gönder"}
      </Button>
    </form>
  );
}
