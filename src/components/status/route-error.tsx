"use client";

import { useEffect } from "react";
import Link from "next/link";
import { CircleAlert, RotateCcw } from "lucide-react";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";

type RouteErrorProps = {
  error: unknown;
  retry: () => void;
  title: string;
  description: string;
  backHref: string;
  backLabel: string;
};

// Shared body of the error.tsx boundaries. Server errors arrive with a generic
// message in production; only the digest is shown, so support can match it
// with the server log without exposing details.
export function RouteError({
  error,
  retry,
  title,
  description,
  backHref,
  backLabel,
}: RouteErrorProps) {
  const t = useTranslations("common.error");

  useEffect(() => {
    console.error(error);
  }, [error]);

  const digest =
    error instanceof Error && "digest" in error && typeof error.digest === "string"
      ? error.digest
      : null;

  return (
    <div role="alert" className="mx-auto max-w-3xl px-6 py-24">
      <title>{title}</title>
      <p className="mb-3 flex items-center gap-2 text-sm font-medium text-destructive">
        <CircleAlert aria-hidden="true" className="size-4" />
        {t("label")}
      </p>
      <h1 className="text-3xl font-semibold">{title}</h1>
      <p className="mt-4 text-muted-foreground">{description}</p>
      {digest ? (
        <p className="mt-2 text-sm text-muted-foreground">
          {t("digest")} <code className="font-mono">{digest}</code>
        </p>
      ) : null}
      <div className="mt-8 flex flex-wrap gap-3">
        <Button type="button" onClick={() => retry()}>
          <RotateCcw aria-hidden="true" />
          {t("retry")}
        </Button>
        <Button asChild variant="outline">
          <Link href={backHref}>{backLabel}</Link>
        </Button>
      </div>
    </div>
  );
}
