"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Languages } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  interfaceLocaleNames,
  interfaceLocales,
  isInterfaceLocale,
  localeCookieMaxAge,
  localeCookieName,
  type InterfaceLocale,
} from "@/lib/interface-locales";

// Stores the choice in the locale cookie and re-renders the current URL;
// src/proxy.ts then serves that locale's copy of the page. The URL never
// changes. Long-lived, SameSite=Lax, no identifier: a strictly functional
// preference cookie (src/lib/interface-locales.ts).
function storeLocale(locale: string) {
  const secure = window.location.protocol === "https:" ? "; Secure" : "";
  document.cookie = `${localeCookieName}=${locale}; Path=/; Max-Age=${localeCookieMaxAge}; SameSite=Lax${secure}`;
}

// Offers the locales enabled in the site settings (Phase 27). With a single
// enabled locale there is nothing to choose, so it renders nothing.
export function LanguageSwitcher({
  align = "end",
  locales = interfaceLocales,
}: {
  align?: "start" | "end";
  locales?: readonly InterfaceLocale[];
}) {
  const t = useTranslations("common.languageSwitcher");
  const locale = useLocale();
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  if (locales.length < 2) return null;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="text-muted-foreground"
          aria-label={t("trigger", { language: interfaceLocaleNames[locale] })}
          disabled={pending}
        >
          <Languages aria-hidden="true" />
          <span lang={locale}>{interfaceLocaleNames[locale]}</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align={align}>
        <DropdownMenuLabel>{t("label")}</DropdownMenuLabel>
        <DropdownMenuRadioGroup
          value={locale}
          onValueChange={(value) => {
            if (!isInterfaceLocale(value) || value === locale || !locales.includes(value)) return;
            storeLocale(value);
            startTransition(() => router.refresh());
          }}
        >
          {locales.map((option) => (
            <DropdownMenuRadioItem key={option} value={option} lang={option}>
              {interfaceLocaleNames[option]}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
