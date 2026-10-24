"use client";

import { useId, useState } from "react";
import { ChevronsUpDown } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  canonicalizePostLanguage,
  commonPostLanguages,
  postLanguageName,
  type PostLanguage,
} from "@/features/posts/language";

type PostLanguagePickerProps = {
  id: string;
  name: string;
  value: PostLanguage;
  onChange: (language: PostLanguage) => void;
  invalid?: boolean;
  describedBy?: string;
};

// Searchable list of common languages plus free entry of any valid tag. The
// chosen tag is submitted through a hidden input; the server validates it
// again (validatePostMetadata, then assert_post_language).
export function PostLanguagePicker({
  id,
  name,
  value,
  onChange,
  invalid,
  describedBy,
}: PostLanguagePickerProps) {
  const t = useTranslations("adminPosts.languagePicker");
  // Language names follow the interface language, not the post's.
  const interfaceLocale = useLocale();
  const listId = useId();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");

  const options = commonPostLanguages.includes(value)
    ? commonPostLanguages
    : [value, ...commonPostLanguages];
  const typed = canonicalizePostLanguage(search);
  const customTag = typed && !options.includes(typed) ? typed : null;
  const valueName = postLanguageName(value, interfaceLocale);

  function choose(language: PostLanguage) {
    onChange(language);
    setSearch("");
    setOpen(false);
  }

  return (
    <>
      <input type="hidden" name={name} value={value} />
      <Popover
        open={open}
        onOpenChange={(next) => {
          setOpen(next);
          if (!next) setSearch("");
        }}
      >
        <PopoverTrigger asChild>
          <Button
            id={id}
            type="button"
            variant="outline"
            role="combobox"
            aria-expanded={open}
            aria-controls={listId}
            aria-invalid={invalid ? true : undefined}
            aria-describedby={describedBy}
            className="w-full justify-between font-normal sm:w-72"
          >
            <span className="truncate">
              {valueName ?? value}{" "}
              <span className="font-mono text-muted-foreground">{value}</span>
            </span>
            <ChevronsUpDown aria-hidden="true" className="opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-(--radix-popover-trigger-width) min-w-72 p-0">
          <Command>
            <CommandInput
              value={search}
              onValueChange={setSearch}
              placeholder={t("searchPlaceholder")}
              aria-label={t("searchLabel")}
            />
            <CommandList id={listId}>
              <CommandEmpty>
                {search.trim().length > 0
                  ? t("noMatch")
                  : t("empty")}
              </CommandEmpty>
              {customTag ? (
                <CommandGroup heading={t("customGroup")}>
                  <CommandItem
                    forceMount
                    value={`custom:${customTag}`}
                    onSelect={() => choose(customTag)}
                  >
                    <span>
                      {postLanguageName(customTag, interfaceLocale) ?? t("unknownName")}{" "}
                      <span className="font-mono text-muted-foreground">{customTag}</span>
                    </span>
                  </CommandItem>
                </CommandGroup>
              ) : null}
              <CommandGroup heading={t("commonGroup")}>
                {options.map((language) => {
                  const languageName = postLanguageName(language, interfaceLocale);
                  return (
                    <CommandItem
                      key={language}
                      value={language}
                      keywords={languageName ? [languageName] : undefined}
                      data-checked={language === value ? true : undefined}
                      onSelect={() => choose(language)}
                    >
                      <span>
                        {languageName ?? language}{" "}
                        <span className="font-mono text-muted-foreground">{language}</span>
                      </span>
                    </CommandItem>
                  );
                })}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
    </>
  );
}
