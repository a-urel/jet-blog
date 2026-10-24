import Form from "next/form";
import { Search } from "lucide-react";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { maxSearchQueryLength, searchPath } from "../query";

// GET form to /search. next/form navigates on the client when JavaScript is
// loaded and submits as a plain form otherwise. The header variant is static
// (the root layout stays prerendered), so it never shows the current query;
// the search page renders the full variant with the query filled in. The
// language filter has no control for now; /search?language=... still works.
export function SearchForm({
  variant,
  query = "",
}: {
  variant: "header" | "page";
  query?: string;
}) {
  const t = useTranslations("search.form");
  const inputId = `search-${variant}-q`;

  if (variant === "header") {
    return (
      <Form action={searchPath} role="search" aria-label={t("headerLabel")} className="flex items-center gap-1">
        <label htmlFor={inputId} className="sr-only">
          {t("inputLabel")}
        </label>
        <Input
          id={inputId}
          type="search"
          name="q"
          placeholder={t("placeholder")}
          maxLength={maxSearchQueryLength}
          autoComplete="off"
          enterKeyHint="search"
          className="h-8 w-full sm:w-48"
        />
        <Button type="submit" variant="ghost" size="icon" aria-label={t("submit")}>
          <Search aria-hidden="true" />
        </Button>
      </Form>
    );
  }

  return (
    <Form action={searchPath} role="search" aria-label={t("pageLabel")} className="flex flex-col gap-3 sm:flex-row sm:items-end">
      <div className="flex flex-1 flex-col gap-2">
        <label htmlFor={inputId} className="text-sm font-medium">
          {t("queryLabel")}
        </label>
        <Input
          id={inputId}
          type="search"
          name="q"
          defaultValue={query}
          maxLength={maxSearchQueryLength}
          autoComplete="off"
          enterKeyHint="search"
          aria-describedby={`${inputId}-hint`}
          className="h-10"
        />
        <p id={`${inputId}-hint`} className="text-sm text-muted-foreground">
          {t("hint")}
        </p>
      </div>
      <Button type="submit" className="h-10 sm:mb-7">
        <Search aria-hidden="true" />
        {t("submit")}
      </Button>
    </Form>
  );
}
