import type { AbstractIntlMessages } from "next-intl";

import { messageNamespaces, type Messages } from "./catalogs";

// Client Components receive their messages through NextIntlClientProvider,
// serialized into the RSC payload of every page under the provider. Each
// provider passes only the message subtrees its Client Components read
// (dot paths), so public pages do not ship sign-in, search, or admin copy.
// A Client Component that starts reading a new key must be listed here; a
// missing key renders as its path (next-intl's fallback) in development and
// production alike.

// Root layout: every page.
export const publicClientMessages = [
  "common.languageSwitcher",
  "common.dialog",
  "common.error",
  "comments",
  "sharing",
  "bookmarks",
] as const;

// Sign-in, sign-up, invitation, and account pages (their layouts).
export const accountClientMessages = [
  ...publicClientMessages,
  "auth.fields",
  "auth.signIn.pending",
  "auth.signIn.submit",
  "auth.signUp.pending",
  "auth.signUp.submit",
  "auth.signUp.displayNameHint",
  "auth.passwordReset.pending",
  "auth.passwordReset.submit",
  "auth.passwordForm",
  "auth.passwordPolicy.hint",
  "auth.inviteConfirm",
  "account.displayName",
  "account.delete",
  "avatars.form",
  "avatars.crop",
] as const;

// Admin layout: every namespace (admin pages are dynamic and members-only).
export const adminClientMessages = messageNamespaces;

type Tree = { [key: string]: string | Tree };

export function pickMessages(messages: Messages, paths: readonly string[]): AbstractIntlMessages {
  const picked: Tree = {};

  for (const path of paths) {
    const segments = path.split(".");
    let source: string | Tree | undefined = messages as unknown as Tree;
    for (const segment of segments) {
      source = typeof source === "object" ? source[segment] : undefined;
    }
    if (source === undefined) throw new Error(`Unknown client message path: ${path}`);

    let target = picked;
    segments.slice(0, -1).forEach((segment) => {
      const next = target[segment];
      target = typeof next === "object" ? next : (target[segment] = {});
    });
    target[segments[segments.length - 1]] = source;
  }

  return picked;
}
