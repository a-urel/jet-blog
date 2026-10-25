import type { Metadata } from "next";

import { canonicalAlternates, defaultSocialImage, socialImages } from "@/features/seo/metadata";
import { staticPagePath, type PublicPage } from "./model";

// Metadata of a published page. Like posts, the path stays relative and the
// root layout's metadataBase makes it absolute. Pages have no cover, so they
// share the site-wide social image.
export function buildPageMetadata(page: PublicPage, siteName: string): Metadata {
  const path = staticPagePath(page.slug);
  const description = page.metaDescription ?? undefined;
  const social = socialImages(defaultSocialImage(siteName), { title: page.title, description });

  return {
    title: page.title,
    description,
    alternates: canonicalAlternates(path),
    openGraph: {
      type: "website",
      url: path,
      siteName,
      title: page.title,
      description,
      ...social.openGraph,
    },
    twitter: social.twitter,
  };
}
