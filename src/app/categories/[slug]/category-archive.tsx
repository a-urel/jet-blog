import type { Metadata } from "next";
import Link from "next/link";
import { notFound, permanentRedirect } from "next/navigation";

import { archivePaths } from "@/features/posts/archives";
import { ArchiveLayout } from "@/features/posts/components/archive-layout";
import { findCategoryArchive } from "@/features/posts/data";
import { pagePath } from "@/features/posts/pagination";
import { buildArchiveMetadata, noIndexMetadata } from "@/features/seo/metadata";
import { getSiteName } from "@/lib/site-url";

// The category archive, shared by /categories/[slug] (page 1) and
// /categories/[slug]/page/[page]. Unknown categories, categories whose subtree
// has no published post, and pages past the end return 404. Every page shows
// the breadcrumb and the child categories that have posts on any page.

export async function categoryArchiveMetadata(slug: string, page: number): Promise<Metadata> {
  const lookup = await findCategoryArchive(slug, page);
  if (lookup.kind !== "archive") return noIndexMetadata;

  const { subject } = lookup;
  return buildArchiveMetadata({
    title: `${subject.name} kategorisi`,
    description: subject.description ?? `${subject.name} kategorisindeki yazılar.`,
    path: archivePaths.category(subject.slug),
    siteName: getSiteName(),
    page,
  });
}

export async function CategoryArchive({ slug, page }: { slug: string; page: number }) {
  const lookup = await findCategoryArchive(slug, page);
  if (lookup.kind === "redirect") {
    permanentRedirect(pagePath(archivePaths.category(lookup.slug), page));
  }
  if (lookup.kind !== "archive") notFound();

  const { subject, posts } = lookup;
  const ancestors = subject.trail.slice(0, -1);

  return (
    <ArchiveLayout
      eyebrow="Kategori"
      title={subject.name}
      description={subject.description}
      basePath={archivePaths.category(subject.slug)}
      posts={posts}
    >
      {ancestors.length > 0 ? (
        <nav aria-label="Üst kategoriler" className="text-sm text-muted-foreground">
          <ol className="flex flex-wrap gap-x-2">
            {ancestors.map((ancestor) => (
              <li key={ancestor.slug} className="flex gap-2">
                <Link
                  href={archivePaths.category(ancestor.slug)}
                  className="rounded-sm hover:text-foreground hover:underline underline-offset-4"
                >
                  {ancestor.name}
                </Link>
                <span aria-hidden="true">/</span>
              </li>
            ))}
            <li aria-current="page">{subject.name}</li>
          </ol>
        </nav>
      ) : null}
      {subject.children.length > 0 ? (
        <div className="space-y-2">
          <p className="text-sm text-muted-foreground">Alt kategorilerin yazıları da listelenir:</p>
          <ul className="flex flex-wrap gap-2 text-sm">
            {subject.children.map((child) => (
              <li key={child.slug}>
                <Link
                  href={archivePaths.category(child.slug)}
                  className="rounded-sm font-medium hover:underline underline-offset-4"
                >
                  {child.name}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </ArchiveLayout>
  );
}
