import { ShieldAlert } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { signOutAction } from "@/features/auth/actions";

type EditorialAccessDeniedProps = {
  title: string;
  description: string;
  email?: string | null;
};

export function EditorialAccessDenied({
  title,
  description,
  email,
}: EditorialAccessDeniedProps) {
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-6 px-6 py-16">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ShieldAlert aria-hidden="true" className="size-5" />
            {title}
          </CardTitle>
          <CardDescription>{description}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {email ? (
            <p className="text-sm text-muted-foreground">
              Oturum: <span className="font-medium">{email}</span>
            </p>
          ) : null}
          <form action={signOutAction}>
            <Button type="submit" variant="outline" className="w-full">
              Çıkış yap
            </Button>
          </form>
        </CardContent>
      </Card>
    </main>
  );
}
