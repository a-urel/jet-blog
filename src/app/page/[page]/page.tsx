import type { Metadata } from "next";
import { notFound, permanentRedirect } from "next/navigation";

import { listPublishedPostPage, listPublishedPosts } from "@/features/posts/data";
import { laterPageParams, parsePageParam } from "@/features/posts/pagination";
import { noIndexMetadata } from "@/features/seo/metadata";
import { HomeListing, homeListingMetadata } from "../../home-listing";

// Later pages of the home listing. Same cache contract as /: pages known at
// build time prerender, others render on first request and are cached; the
// publication Server Actions revalidate every /page/[page] entry, because one
// published or unpublished post shifts every later page. /page/1 redirects to
// /, and invalid or out-of-range pages return 404.
export const revalidate = 300;

export async function generateStaticParams() {
  return laterPageParams((await listPublishedPosts()).length);
}

export async function generateMetadata({ params }: PageProps<"/page/[page]">): Promise<Metadata> {
  const page = parsePageParam((await params).page);
  if (page === null || page === 1) return noIndexMetadata;

  return (await listPublishedPostPage(page)) ? homeListingMetadata(page) : noIndexMetadata;
}

export default async function HomeListingPage({ params }: PageProps<"/page/[page]">) {
  const page = parsePageParam((await params).page);
  if (page === null) notFound();
  if (page === 1) permanentRedirect("/");

  const posts = await listPublishedPostPage(page);
  if (!posts) notFound();

  return <HomeListing posts={posts} />;
}
