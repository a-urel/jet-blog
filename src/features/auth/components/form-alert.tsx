import { CircleAlert, CircleCheck } from "lucide-react";

type FormAlertProps = {
  id?: string;
  tone: "error" | "success";
  children: React.ReactNode;
};

// Inline form feedback with the same tokens as the existing admin forms.
export function FormAlert({ id, tone, children }: FormAlertProps) {
  if (tone === "error") {
    return (
      <p
        id={id}
        role="alert"
        className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive"
      >
        <CircleAlert aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
        {children}
      </p>
    );
  }

  return (
    <p
      id={id}
      role="status"
      className="flex items-start gap-2 rounded-lg border border-emerald-600/30 bg-emerald-600/10 px-3 py-2 text-sm text-emerald-800 dark:text-emerald-300"
    >
      <CircleCheck aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
      {children}
    </p>
  );
}
