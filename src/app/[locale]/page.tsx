import type { Metadata } from "next";

import { listPublishedPostPage } from "@/features/posts/data";
import { buildWebSiteJsonLd, serializeJsonLd } from "@/features/seo/json-ld";
import { getSiteSettings } from "@/features/site-settings/data";
import { getConfiguredSiteUrl } from "@/lib/site-url";
import { HomeListing, homeListingMetadata } from "./home-listing";

// Prerendered from published rows and regenerated on demand: publication
// Server Actions call revalidatePath("/") and revalidatePath("/page/[page]").
// The interval is only a fallback for changes made outside the application
// (for example service-role scripts).
export const revalidate = 300;

export async function generateMetadata(): Promise<Metadata> {
  return homeListingMetadata(1);
}

export default async function Home() {
  // Page 1 always exists; an empty listing renders its empty state.
  const [posts, site] = await Promise.all([listPublishedPostPage(1), getSiteSettings()]);
  // WebSite and Organization (with sameAs social profiles) on the home page.
  const jsonLd = buildWebSiteJsonLd(site, getConfiguredSiteUrl());

  return (
    <>
      {jsonLd ? (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: serializeJsonLd(jsonLd) }}
        />
      ) : null}
      {posts ? <HomeListing posts={posts} /> : null}
    </>
  );
}
