import Form from "next/form";
import { Search } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { postLanguageLabels, postLanguages, type PostLanguage } from "@/features/posts/language";
import { maxSearchQueryLength, searchPath } from "../query";

// GET form to /search. next/form navigates on the client when JavaScript is
// loaded and submits as a plain form otherwise. The header variant is static
// (the root layout stays prerendered), so it never shows the current query;
// the search page renders the full variant with the query and filter filled in.
export function SearchForm({
  variant,
  query = "",
  language = null,
}: {
  variant: "header" | "page";
  query?: string;
  language?: PostLanguage | null;
}) {
  const inputId = `search-${variant}-q`;

  if (variant === "header") {
    return (
      <Form action={searchPath} role="search" aria-label="Site içinde ara" className="flex items-center gap-1">
        <label htmlFor={inputId} className="sr-only">
          Yazılarda ara
        </label>
        <Input
          id={inputId}
          type="search"
          name="q"
          placeholder="Yazılarda ara"
          maxLength={maxSearchQueryLength}
          autoComplete="off"
          enterKeyHint="search"
          className="h-8 w-full sm:w-48"
        />
        <Button type="submit" variant="ghost" size="icon" aria-label="Ara">
          <Search aria-hidden="true" />
        </Button>
      </Form>
    );
  }

  return (
    <Form action={searchPath} role="search" aria-label="Yazılarda ara" className="flex flex-col gap-3 sm:flex-row sm:items-end">
      <div className="flex flex-1 flex-col gap-2">
        <label htmlFor={inputId} className="text-sm font-medium">
          Aranacak sözcükler
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
          Tam ifade için tırnak, hariç tutmak için eksi kullanın: &quot;küçük adım&quot; -taslak
        </p>
      </div>
      <div className="flex flex-col gap-2 sm:mb-7">
        <label htmlFor={`${inputId}-language`} className="text-sm font-medium">
          Dil
        </label>
        <NativeSelect
          id={`${inputId}-language`}
          name="language"
          defaultValue={language ?? ""}
          className="w-full sm:w-40"
        >
          <NativeSelectOption value="">Tüm diller</NativeSelectOption>
          {postLanguages.map((code) => (
            <NativeSelectOption key={code} value={code}>
              {postLanguageLabels[code]}
            </NativeSelectOption>
          ))}
        </NativeSelect>
      </div>
      <Button type="submit" className="h-10 sm:mb-7">
        <Search aria-hidden="true" />
        Ara
      </Button>
    </Form>
  );
}
