import Link from "next/link";

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

export function SupabaseNotConfigured({ action }: { action: string }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Supabase yapılandırılmadı</CardTitle>
        <CardDescription>
          {action} için <code>.env.local</code> dosyasına Supabase URL ve
          publishable key değerlerini ekleyin.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Button asChild variant="outline">
          <Link href="/">Yazılara dön</Link>
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
