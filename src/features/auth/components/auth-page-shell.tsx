import Link from "next/link";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

type AuthPageShellProps = {
  eyebrow: string;
  title: string;
  description?: React.ReactNode;
  children: React.ReactNode;
};

// Shared narrow layout for sign-in, sign-up, password, and account pages.
export function AuthPageShell({
  eyebrow,
  title,
  description,
  children,
}: AuthPageShellProps) {
  return (
    <div className="mx-auto flex max-w-md flex-col gap-6 px-6 py-16 sm:py-24">
      <div className="space-y-3">
        <p className="text-sm font-medium text-muted-foreground">{eyebrow}</p>
        <h1 className="text-3xl font-semibold tracking-tight">{title}</h1>
        {description ? (
          <p className="text-muted-foreground">{description}</p>
        ) : null}
      </div>
      {children}
    </div>
  );
}

// `action` is a translated infinitive phrase that completes the sentence in
// auth.notConfigured.description: "Giriş yapmak" (tr), "sign in" (en),
// "sich anzumelden" (de, a zu-infinitive after "Um").
export function SupabaseNotConfigured({ action }: { action: string }) {
  const t = useTranslations("auth.notConfigured");

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("title")}</CardTitle>
        <CardDescription>
          {t.rich("description", { action, code: (chunks) => <code>{chunks}</code> })}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Button asChild variant="outline">
          <Link href="/">{t("back")}</Link>
        </Button>
      </CardContent>
    </Card>
  );
}

export function StatusNotice({ children }: { children: React.ReactNode }) {
  return (
    <p
      role="status"
      className="rounded-lg border bg-muted/50 px-3 py-2 text-sm text-muted-foreground"
    >
      {children}
    </p>
  );
}
