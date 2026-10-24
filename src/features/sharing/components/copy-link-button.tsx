"use client";

import { useEffect, useRef, useState } from "react";
import { Check, Link as LinkIcon } from "lucide-react";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type CopyState = "idle" | "copied" | "failed";

// Copies the canonical URL passed from the server, not window.location, so
// query strings or fragments in the reader's address bar are never shared.
export function CopyLinkButton({ url }: { url: string }) {
  const t = useTranslations("sharing");
  const [state, setState] = useState<CopyState>("idle");
  const fallbackRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (state === "failed") fallbackRef.current?.select();
    if (state !== "copied") return;
    const timer = window.setTimeout(() => setState("idle"), 3000);
    return () => window.clearTimeout(timer);
  }, [state]);

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setState("copied");
    } catch {
      // Clipboard access can be denied (permissions, insecure origin).
      setState("failed");
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <Button type="button" variant="outline" onClick={copy} className="self-start">
        {state === "copied" ? <Check aria-hidden="true" /> : <LinkIcon aria-hidden="true" />}
        {state === "copied" ? t("copied") : t("copy")}
      </Button>
      <p role="status" aria-live="polite" className="sr-only">
        {state === "copied" ? t("copiedStatus") : ""}
      </p>
      {state === "failed" ? (
        <div className="flex flex-col gap-1.5">
          <p className="text-sm text-muted-foreground" role="alert">
            {t("copyFailed")}
          </p>
          <Input
            ref={fallbackRef}
            readOnly
            value={url}
            aria-label={t("linkLabel")}
            onFocus={(event) => event.currentTarget.select()}
          />
        </div>
      ) : null}
    </div>
  );
}
