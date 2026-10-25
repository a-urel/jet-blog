import { avatarPublicUrl } from "@/features/avatars/url";
import { archivePaths, postPath } from "@/features/posts/archives";
import { mediaPublicUrl } from "@/features/media/url";
import type { PostSummary } from "@/features/posts/types";
import type { SiteSettings } from "@/features/site-settings/model";
import { socialLinkEntries } from "@/features/site-settings/social";
import { absoluteSiteUrl } from "@/lib/site-url";
import { postCoverImageUrl } from "./metadata";

type JsonLd = Record<string, unknown>;

// schema.org BlogPosting for a published post. Authors keep their credit
// order. URLs are included only when a site origin is configured, because
// structured data requires absolute URLs. An author's avatar (on the Storage
// origin, absolute without metadataBase) becomes the Person image.
export function buildArticleJsonLd(
  post: PostSummary,
  options: { siteUrl: URL | null; site: SiteJsonLdInput },
): JsonLd {
  const url = absoluteSiteUrl(postPath(post.slug), options.siteUrl);
  const image = postCoverImageUrl(post);

  return {
    "@context": "https://schema.org",
    "@type": "BlogPosting",
    headline: post.title,
    ...(post.excerpt ? { description: post.excerpt } : {}),
    ...(image ? { image: [image] } : {}),
    datePublished: post.publishedAt,
    dateModified: post.updatedAt,
    author: post.authors.map(({ author }) => {
      const authorUrl = absoluteSiteUrl(archivePaths.author(author.slug), options.siteUrl);
      const authorImage = author.avatarId ? avatarPublicUrl("authors", author.avatarId) : null;
      return {
        "@type": "Person",
        name: author.name,
        ...(authorUrl ? { url: authorUrl } : {}),
        ...(authorImage ? { image: authorImage } : {}),
      };
    }),
    articleSection: post.category.name,
    ...(post.tags.length > 0 ? { keywords: post.tags.map((tag) => tag.name) } : {}),
    inLanguage: post.language,
    publisher: buildOrganizationJsonLd(options.site, options.siteUrl),
    ...(url ? { url, mainEntityOfPage: { "@type": "WebPage", "@id": url } } : {}),
  };
}

type SiteJsonLdInput = Pick<
  SiteSettings,
  "siteName" | "metaDescription" | "logoLightMediaId" | "socialLinks" | "defaultLocale"
>;

// The publication as a schema.org Organization: name, home URL, the light
// logo (absolute, on the media origin), and the validated social profile
// links as sameAs. Used as the Article publisher and on the home page.
export function buildOrganizationJsonLd(site: SiteJsonLdInput, siteUrl: URL | null): JsonLd {
  const url = absoluteSiteUrl("/", siteUrl);
  const logo = site.logoLightMediaId ? mediaPublicUrl(site.logoLightMediaId) : null;
  const sameAs = socialLinkEntries(site.socialLinks).map((link) => link.url);

  return {
    "@type": "Organization",
    name: site.siteName,
    ...(url ? { url } : {}),
    ...(logo ? { logo: { "@type": "ImageObject", url: logo } } : {}),
    ...(sameAs.length > 0 ? { sameAs } : {}),
  };
}

// schema.org WebSite for the home page, with the Organization as publisher.
// Only emitted with a site origin, because the WebSite needs its URL.
export function buildWebSiteJsonLd(site: SiteJsonLdInput, siteUrl: URL | null): JsonLd | null {
  const url = absoluteSiteUrl("/", siteUrl);
  if (!url) return null;

  return {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: site.siteName,
    url,
    ...(site.metaDescription ? { description: site.metaDescription } : {}),
    inLanguage: site.defaultLocale,
    publisher: buildOrganizationJsonLd(site, siteUrl),
  };
}

// JSON.stringify does not make data safe inside <script>. Escaping <, >, and
// & keeps "</script>" and HTML comment sequences from ending the element, and
// U+2028/U+2029 are escaped for older JavaScript parsers. The result is still
// valid JSON that parses back to the same value.
export function serializeJsonLd(value: JsonLd): string {
  return JSON.stringify(value)
    .replace(/</g, "\\u003c")
    .replace(/>/g, "\\u003e")
    .replace(/&/g, "\\u0026")
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029");
}
