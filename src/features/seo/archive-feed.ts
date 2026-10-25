import "server-only";

import { permanentRedirect } from "next/navigation";
import { getTranslations } from "next-intl/server";

import { archivePaths } from "@/features/posts/archives";
import { findArchiveFeed, type ArchiveKind } from "@/features/posts/data";
import { getSiteSettings } from "@/features/site-settings/data";
import type { SiteSettings } from "@/features/site-settings/model";
import { getConfiguredSiteUrl } from "@/lib/site-url";
import {
  archiveFeedPath,
  buildAtomFeed,
  feedContentType,
  feedPostLimit,
  type FeedChannel,
} from "./feed";

// Category, tag, and author feeds. Like the site feed (src/app/feed.xml), a
// feed has one copy outside the [locale] segment, so its title is in the
// default interface language of the site settings, matching the feed's
// xml:lang. The archive's title follows the page title template
// ("<title> | <site>").
export async function archiveFeedChannel(
  archive: ArchiveKind,
  subject: { name: string; slug: string },
  site: Pick<SiteSettings, "siteName" | "defaultLocale">,
): Promise<FeedChannel> {
  const t = await getTranslations({ locale: site.defaultLocale, namespace: "archives" });
  const title =
    archive === "category"
      ? t("category.title", { name: subject.name })
      : archive === "tag"
        ? t("tag.title", { name: subject.name })
        : subject.name;
  const htmlPath = archivePaths[archive](subject.slug);

  return { path: archiveFeedPath(htmlPath), title: `${title} | ${site.siteName}`, htmlPath };
}

// Entry ids, links, and the self link need absolute URLs. Without a site
// origin there is no valid feed, so feed routes answer 404 (robots.txt also
// disallows everything then).
export function feedNotFound(): Response {
  return new Response("Not Found", {
    status: 404,
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
}

export function feedResponse(xml: string): Response {
  return new Response(xml, {
    headers: { "Content-Type": `${feedContentType}; charset=utf-8` },
  });
}

// An unknown slug, or an archive without a published post, answers 404; an
// old slug redirects to the current archive's feed, like the archive page.
export async function archiveFeedResponse(archive: ArchiveKind, slug: string): Promise<Response> {
  const siteUrl = getConfiguredSiteUrl();
  if (!siteUrl) return feedNotFound();

  const lookup = await findArchiveFeed(archive, slug, feedPostLimit);
  if (lookup.kind === "redirect") {
    permanentRedirect(archiveFeedPath(archivePaths[archive](lookup.slug)));
  }
  if (lookup.kind !== "feed") return feedNotFound();

  const site = await getSiteSettings();
  const channel = await archiveFeedChannel(archive, lookup.subject, site);
  return feedResponse(
    buildAtomFeed({
      siteUrl,
      siteName: site.siteName,
      language: site.defaultLocale,
      subtitle: site.tagline,
      posts: lookup.posts,
      channel,
    }),
  );
}
