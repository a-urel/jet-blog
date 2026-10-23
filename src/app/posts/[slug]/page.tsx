import type { Metadata } from "next";
import Link from "next/link";
import { notFound, permanentRedirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { PostBody } from "@/features/posts/components/post-body";
import { PostMeta } from "@/features/posts/components/post-meta";
import { findPublishedPost, listPublishedSlugs } from "@/features/posts/data";

// Published posts are prerendered at build time; posts published later render
// on first request and are then cached (ISR). Publication Server Actions call
// revalidatePath("/posts/[slug]", "page"), so publish, edit, slug change, and
// unpublish are visible on the next request. The interval is a fallback for
// out-of-band database changes. Only anonymous, RLS-filtered reads happen
// here; drafts and member previews (/admin/posts/[id]/preview, force-dynamic)
// never enter this cache.
export const revalidate = 300;

export async function generateStaticParams() {
  return (await listPublishedSlugs()).map((slug) => ({ slug }));
}

export async function generateMetadata({
  params,
}: PageProps<"/posts/[slug]">): Promise<Metadata> {
  const { slug } = await params;
  const lookup = await findPublishedPost(slug);
  if (lookup.kind !== "post") return {};

  return {
    title: lookup.post.title,
    description: lookup.post.excerpt ?? undefined,
    alternates: { canonical: `/posts/${lookup.post.slug}` },
  };
}

export default async function PostPage({ params }: PageProps<"/posts/[slug]">) {
  const { slug } = await params;
  const lookup = await findPublishedPost(slug);

  if (lookup.kind === "redirect") permanentRedirect(`/posts/${lookup.slug}`);
  if (lookup.kind === "missing") notFound();

  const { post } = lookup;

  return (
    <article className="mx-auto max-w-3xl px-6 py-10 sm:py-16">
      <Button asChild variant="ghost" className="mb-10">
        <Link href="/"><ArrowLeft aria-hidden="true" /> Tüm yazılar</Link>
      </Button>
      <header className="space-y-6 border-b pb-8">
        <Badge variant="secondary">{post.category.name}</Badge>
        <h1 className="text-3xl leading-tight font-semibold tracking-tight sm:text-5xl">
          {post.title}
        </h1>
        {post.excerpt ? (
          <p className="text-lg leading-relaxed text-muted-foreground">{post.excerpt}</p>
        ) : null}
        <PostMeta post={post} />
      </header>
      <div className="py-10">
        <PostBody body={post.body} contentVersion={post.contentVersion} />
      </div>
      {post.tags.length > 0 ? (
        <footer className="border-t pt-6">
          <h2 className="mb-3 text-sm font-medium text-muted-foreground">Etiketler</h2>
          <ul className="flex flex-wrap gap-2">
            {post.tags.map((tag) => (
              <li key={tag.id}><Badge variant="outline">{tag.name}</Badge></li>
            ))}
          </ul>
        </footer>
      ) : null}
    </article>
  );
}
