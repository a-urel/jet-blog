import { archivePaths, postPath } from "@/features/posts/archives";
import type { PostSummary } from "@/features/posts/types";
import { absoluteSiteUrl } from "@/lib/site-url";
import { postCoverImageUrl } from "./metadata";

type JsonLd = Record<string, unknown>;

// schema.org BlogPosting for a published post. Authors keep their credit
// order. URLs are included only when a site origin is configured, because
// structured data requires absolute URLs.
export function buildArticleJsonLd(
  post: PostSummary,
  options: { siteUrl: URL | null; siteName: string },
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
      return { "@type": "Person", name: author.name, ...(authorUrl ? { url: authorUrl } : {}) };
    }),
    articleSection: post.category.name,
    ...(post.tags.length > 0 ? { keywords: post.tags.map((tag) => tag.name) } : {}),
    inLanguage: post.language,
    publisher: { "@type": "Organization", name: options.siteName },
    ...(url ? { url, mainEntityOfPage: { "@type": "WebPage", "@id": url } } : {}),
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
