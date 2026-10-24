import { createTranslator } from "next-intl";
import { describe, expect, it } from "vitest";

import { interfaceLocales } from "@/lib/interface-locales";

import { catalogs, messageNamespaces } from "./catalogs";
import { formats, timeZone } from "./formats";

type Tree = { [key: string]: string | Tree };

function flatten(tree: Tree, prefix = ""): Map<string, string> {
  const entries = new Map<string, string>();
  for (const [key, value] of Object.entries(tree)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (typeof value === "string") {
      entries.set(path, value);
    } else {
      for (const [nested, text] of flatten(value, path)) entries.set(nested, text);
    }
  }
  return entries;
}

const flat = Object.fromEntries(
  interfaceLocales.map((locale) => [locale, flatten(catalogs[locale] as unknown as Tree)]),
) as Record<(typeof interfaceLocales)[number], Map<string, string>>;

// ICU argument names ({name}, {count, plural, …}) and rich-text tags
// (<link>). Plural and select branches are messages themselves, so their
// arguments count too, while branch keys ({category} in a select) do not.
function collectArguments(message: string, start: number, names: Set<string>): number {
  let index = start;
  while (index < message.length) {
    const char = message[index];
    if (char === "'" && "{}'".includes(message[index + 1] ?? "")) {
      // Quoted literal: '' is an apostrophe, '{…}' is literal text.
      const end = message[index + 1] === "'" ? index + 1 : message.indexOf("'", index + 1);
      index = end === -1 ? message.length : end + 1;
    } else if (char === "}") {
      return index;
    } else if (char === "{") {
      const match = /^\{\s*([A-Za-z_]\w*)\s*(?:,\s*(\w+)\s*)?/.exec(message.slice(index));
      if (!match) return message.length;
      names.add(match[1]);
      index += match[0].length;
      if (match[2] === "plural" || match[2] === "select" || match[2] === "selectordinal") {
        index = message.indexOf(",", index) + 1;
        // selector {message} pairs until the argument closes.
        while (index > 0 && index < message.length) {
          const open = message.indexOf("{", index);
          const close = message.indexOf("}", index);
          if (close !== -1 && (open === -1 || close < open)) {
            index = close;
            break;
          }
          index = collectArguments(message, open + 1, names) + 1;
        }
      } else {
        index = message.indexOf("}", index);
      }
      index += 1;
    } else {
      index += 1;
    }
  }
  return index;
}

function placeholders(message: string) {
  const names = new Set<string>();
  collectArguments(message, 0, names);
  for (const match of message.matchAll(/<([A-Za-z][\w]*)>/g)) names.add(`<${match[1]}>`);
  return [...names].sort();
}

it("reads ICU arguments, not plural or select branch keys", () => {
  expect(placeholders("{kind, select, category {Kategori} other {{name} etiketi}}")).toEqual([
    "kind",
    "name",
  ]);
  expect(placeholders("{count, plural, one {# post} other {# posts}} by <link>{author}</link>")).toEqual([
    "<link>",
    "author",
    "count",
  ]);
  expect(placeholders("URL''de '{literal}' {max, number, ::group-off}")).toEqual(["max"]);
});

describe("message catalogs", () => {
  it("has a catalog for every interface locale and namespace", () => {
    for (const locale of interfaceLocales) {
      expect(Object.keys(catalogs[locale]).sort()).toEqual([...messageNamespaces].sort());
    }
  });

  it.each(interfaceLocales.filter((locale) => locale !== "tr"))(
    "%s has exactly the keys of the Turkish source catalog",
    (locale) => {
      expect([...flat[locale].keys()].sort()).toEqual([...flat.tr.keys()].sort());
    },
  );

  it.each(interfaceLocales)("%s has no empty messages", (locale) => {
    const empty = [...flat[locale]].filter(([, text]) => text.trim() === "").map(([key]) => key);
    expect(empty).toEqual([]);
  });

  it.each(interfaceLocales.filter((locale) => locale !== "tr"))(
    "%s uses the same ICU arguments and tags as Turkish",
    (locale) => {
      const mismatches = [...flat.tr]
        .filter(([key, text]) => {
          const translated = flat[locale].get(key);
          return (
            translated !== undefined &&
            JSON.stringify(placeholders(text)) !== JSON.stringify(placeholders(translated))
          );
        })
        .map(([key]) => key);
      expect(mismatches).toEqual([]);
    },
  );

  it.each(interfaceLocales)("%s messages are valid ICU and format without errors", (locale) => {
    const errors: string[] = [];
    const t = createTranslator({
      locale,
      messages: catalogs[locale],
      formats,
      timeZone,
      onError: (error) => errors.push(error.message),
    });
    const translate = t as unknown as {
      markup: (key: string, values: Record<string, unknown>) => string;
    };

    for (const [key, text] of flat[locale]) {
      const values: Record<string, unknown> = {};
      for (const name of placeholders(text)) {
        if (name.startsWith("<")) values[name.slice(1, -1)] = (chunks: string) => chunks;
        else values[name] = 2;
      }
      const output = translate.markup(key, values);
      if (output === key) errors.push(`${key}: not formatted`);
    }

    expect(errors).toEqual([]);
  });
});
