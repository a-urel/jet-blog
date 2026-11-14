"use client";

import type { ComponentProps, ReactNode } from "react";
import { useFormStatus } from "react-dom";

import { Button } from "@/components/ui/button";

type PendingSubmitButtonProps = Omit<ComponentProps<typeof Button>, "type" | "children"> & {
  children: ReactNode;
  // Shown while the enclosing form's Server Action runs.
  pendingChildren: ReactNode;
};

// Submit button for a plain <form action={serverAction}> in a Server
// Component: disabled and relabeled while the action runs, so a slow action
// shows progress and cannot be submitted twice.
export function PendingSubmitButton({
  children,
  pendingChildren,
  disabled,
  ...props
}: PendingSubmitButtonProps) {
  const { pending } = useFormStatus();

  return (
    <Button {...props} type="submit" disabled={disabled || pending} aria-busy={pending || undefined}>
      {pending ? pendingChildren : children}
    </Button>
  );
}
