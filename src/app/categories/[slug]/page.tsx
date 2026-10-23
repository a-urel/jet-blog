import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { archivePaths } from "@/features/posts/archives";
import { ArchiveLayout } from "@/features/posts/components/archive-layout";
import { findCategoryArchive, listPublicArchives } from "@/features/posts/data";
import { buildArchiveMetadata, noIndexMetadata } from "@/features/seo/metadata";
import { getSiteName } from "@/lib/site-url";

// Same cache contract as /posts/[slug]: ISR with tagged anonymous reads that
// publication Server Actions expire. Unknown categories and categories whose
// subtree has no published post return 404.
export const revalidate = 300;

export async function generateStaticParams() {
  return (await listPublicArchives()).categories.map(({ slug }) => ({ slug }));
}

export async function generateMetadata({
  params,
}: PageProps<"/categories/[slug]">): Promise<Metadata> {
  const { slug } = await params;
  const lookup = await findCategoryArchive(slug);
  if (lookup.kind !== "archive") return noIndexMetadata;

  const { subject } = lookup;
  return buildArchiveMetadata({
    title: `${subject.name} kategorisi`,
    description: subject.description ?? `${subject.name} kategorisindeki yazılar.`,
    path: archivePaths.category(subject.slug),
    siteName: getSiteName(),
  });
}

export default async function CategoryArchivePage({
  params,
}: PageProps<"/categories/[slug]">) {
  const { slug } = await params;
  const lookup = await findCategoryArchive(slug);
  if (lookup.kind !== "archive") notFound();

  const { subject, posts } = lookup;
  const ancestors = subject.trail.slice(0, -1);

  return (
    <ArchiveLayout eyebrow="Kategori" title={subject.name} description={subject.description} posts={posts}>
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
