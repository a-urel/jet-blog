import { mediaPublicUrl } from "@/features/media/url";
import { archivePaths, postPath } from "@/features/posts/archives";
import { defaultPostLanguage } from "@/features/posts/language";
import type { PostSummary } from "@/features/posts/types";
import { getConfiguredSiteUrl, getSiteName } from "@/lib/site-url";

// Atom 1.0 (RFC 4287) feed of the latest published posts. The input comes
// from anonymous, RLS-filtered reads (src/features/posts/data.ts), so drafts
// and member-only data never reach it. Entries carry the excerpt as a text
// summary, not the body: the shared renderer outputs React with optimized
// image URLs, and a summary keeps every value plain escaped text.

export const feedPath = "/feed.xml";
export const feedContentType = "application/atom+xml";
export const feedPostLimit = 20;

// Discovery link (<link rel="alternate" type="application/atom+xml">) for
// Metadata alternates.types. Omitted without a site origin, where the feed
// answers 404.
export function feedAlternateTypes(
  siteUrl: URL | null = getConfiguredSiteUrl(),
  siteName: string = getSiteName(),
) {
  return siteUrl ? { [feedContentType]: [{ url: feedPath, title: siteName }] } : undefined;
}

// Characters XML 1.0 does not allow at all, even escaped: C0 controls other
// than tab, newline, and carriage return, lone surrogates, U+FFFE, and U+FFFF.
const invalidXmlCharacters = /[^\t\n\r -퟿-�\u{10000}-\u{10FFFF}]/gu;

// Escapes text for element content and double- or single-quoted attributes.
// Escaping ">" also breaks "]]>", which is not allowed in character data.
export function escapeXml(value: string): string {
  return value
    .replace(invalidXmlCharacters, "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

// Only absolute HTTP(S) URLs are emitted; anything else is dropped.
function safeAbsoluteUrl(value: string | null): string | null {
  if (!value) return null;

  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:" ? url.href : null;
  } catch {
    return null;
  }
}

// RFC 3339 timestamp, or null for a value that does not parse.
function atomDate(value: string): string | null {
  const time = Date.parse(value);
  return Number.isFinite(time) ? new Date(time).toISOString() : null;
}

function element(name: string, text: string, attributes = ""): string {
  return `<${name}${attributes}>${escapeXml(text)}</${name}>`;
}

function attribute(name: string, value: string): string {
  return ` ${name}="${escapeXml(value)}"`;
}

function buildEntry(post: PostSummary, siteUrl: URL): string | null {
  const published = atomDate(post.publishedAt);
  const updated = atomDate(post.updatedAt);
  if (!published || !updated) return null;

  const url = (path: string) => new URL(path, siteUrl).href;
  const cover = safeAbsoluteUrl(post.cover ? mediaPublicUrl(post.cover.mediaId) : null);

  const lines = [
    `<entry${attribute("xml:lang", post.language)}>`,
    // The post id is stable across slug changes; the slug is not.
    element("id", `urn:uuid:${post.id}`),
    element("title", post.title, attribute("type", "text")),
    `<link rel="alternate" type="text/html"${attribute("href", url(postPath(post.slug)))}/>`,
    element("published", published),
    element("updated", updated),
    ...post.authors.map(
      ({ author }) =>
        `<author>${element("name", author.name)}${element("uri", url(archivePaths.author(author.slug)))}</author>`,
    ),
    `<category${attribute("term", post.category.slug)}${attribute("label", post.category.name)}${attribute("scheme", url("/categories/"))}/>`,
    ...post.tags.map(
      (tag) =>
        `<category${attribute("term", tag.slug)}${attribute("label", tag.name)}${attribute("scheme", url("/tags/"))}/>`,
    ),
    ...(post.excerpt ? [element("summary", post.excerpt, attribute("type", "text"))] : []),
    // Media RSS is the de facto extension readers use for entry images.
    ...(cover
      ? [
          `<media:thumbnail${attribute("url", cover)}/>`,
          `<media:content${attribute("url", cover)} medium="image">${element(
            "media:description",
            post.cover?.alt ?? "",
            attribute("type", "plain"),
          )}</media:content>`,
        ]
      : []),
    "</entry>",
  ];

  return lines.join("\n");
}

// Entries keep the input order (newest publication first, see
// selectLatestPublishedPosts). The feed's updated time is the latest entry
// update; an empty feed falls back to the generation time.
export function buildAtomFeed(input: {
  siteUrl: URL;
  siteName: string;
  posts: readonly PostSummary[];
  now?: Date;
}): string {
  const { siteUrl, siteName, posts } = input;
  const selfUrl = new URL(feedPath, siteUrl).href;
  const entries = posts.flatMap((post) => {
    const entry = buildEntry(post, siteUrl);
    return entry ? [{ entry, updated: Date.parse(post.updatedAt) }] : [];
  });
  const newest = entries.reduce((latest, { updated }) => Math.max(latest, updated), -Infinity);
  const updated = new Date(Number.isFinite(newest) ? newest : (input.now ?? new Date()).getTime());

  return [
    '<?xml version="1.0" encoding="utf-8"?>',
    `<feed xmlns="http://www.w3.org/2005/Atom" xmlns:media="http://search.yahoo.com/mrss/"${attribute("xml:lang", defaultPostLanguage)}>`,
    element("id", selfUrl),
    element("title", siteName, attribute("type", "text")),
    element("updated", updated.toISOString()),
    `<link rel="self"${attribute("type", feedContentType)}${attribute("href", selfUrl)}/>`,
    `<link rel="alternate" type="text/html"${attribute("href", new URL("/", siteUrl).href)}/>`,
    // Entries without credited authors inherit the publication.
    `<author>${element("name", siteName)}</author>`,
    ...entries.map(({ entry }) => entry),
    "</feed>",
    "",
  ].join("\n");
}
