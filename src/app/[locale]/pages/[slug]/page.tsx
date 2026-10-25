import type { Metadata } from "next";
import { notFound, permanentRedirect } from "next/navigation";
import { getFormatter, getTranslations } from "next-intl/server";

import { findPublishedPage, listPublishedPages } from "@/features/pages/data";
import { buildPageMetadata } from "@/features/pages/metadata";
import { staticPagePath } from "@/features/pages/model";
import { PostBody } from "@/features/posts/components/post-body";
import { noIndexMetadata } from "@/features/seo/metadata";
import { getSiteName } from "@/lib/site-url";

// Static pages (Phase 28) are prerendered at build time; pages published later
// render on first request and are then cached (ISR). Page Server Actions
// expire publicPagesCacheTag and revalidate every page below the root layout
// (src/features/pages/cache.ts), so publish, edit, slug change, and unpublish
// are visible on the next request. The interval is a fallback for
// out-of-band database changes. Only anonymous, RLS-filtered reads happen
// here; drafts never enter this cache.
export const revalidate = 300;

export async function generateStaticParams() {
  return (await listPublishedPages()).map((page) => ({ slug: page.slug }));
}

export async function generateMetadata({
  params,
}: PageProps<"/[locale]/pages/[slug]">): Promise<Metadata> {
  const { slug } = await params;
  const lookup = await findPublishedPage(slug);
  if (lookup.kind !== "page") return noIndexMetadata;

  return buildPageMetadata(lookup.page, getSiteName());
}

export default async function StaticPage({ params }: PageProps<"/[locale]/pages/[slug]">) {
  const { slug } = await params;
  const lookup = await findPublishedPage(slug);

  if (lookup.kind === "redirect") permanentRedirect(staticPagePath(lookup.slug));
  if (lookup.kind === "missing") notFound();

  const { page } = lookup;
  const [t, format] = await Promise.all([getTranslations("pages.page"), getFormatter()]);

  return (
    <article className="mx-auto max-w-3xl px-6 py-10 sm:py-16">
      <header className="space-y-4 border-b pb-8">
        <h1 className="text-3xl leading-tight font-semibold tracking-tight sm:text-5xl">
          {page.title}
        </h1>
        {/* Legal texts need a visible "last updated" date. A save of a
            published page changes it; the time zone is fixed (formats.ts). */}
        <p className="text-sm text-muted-foreground">
          {t.rich("lastUpdated", {
            date: () => (
              <time dateTime={page.updatedAt}>
                {format.dateTime(new Date(page.updatedAt), "date")}
              </time>
            ),
          })}
        </p>
      </header>
      <div className="py-10">
        <PostBody body={page.body} contentVersion={page.contentVersion} />
      </div>
    </article>
  );
}
