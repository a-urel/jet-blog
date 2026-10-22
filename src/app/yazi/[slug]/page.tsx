import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { PostBody } from "@/features/posts/components/post-body";
import { PostMeta } from "@/features/posts/components/post-meta";
import { getPostBySlug, listPosts } from "@/features/posts/data";

export function generateStaticParams() {
  return listPosts().map((post) => ({ slug: post.slug }));
}

export async function generateMetadata({
  params,
}: PageProps<"/yazi/[slug]">): Promise<Metadata> {
  const { slug } = await params;
  const post = getPostBySlug(slug);
  if (!post) notFound();

  return { title: post.title, description: post.excerpt };
}

export default async function PostPage({ params }: PageProps<"/yazi/[slug]">) {
  const { slug } = await params;
  const post = getPostBySlug(slug);
  if (!post) notFound();

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
        <p className="text-lg leading-relaxed text-muted-foreground">{post.excerpt}</p>
        <PostMeta post={post} />
      </header>
      <div className="py-10">
        <PostBody body={post.body} contentVersion={post.contentVersion} />
      </div>
      <footer className="border-t pt-6">
        <h2 className="mb-3 text-sm font-medium text-muted-foreground">Etiketler</h2>
        <ul className="flex flex-wrap gap-2">
          {post.tags.map((tag) => (
            <li key={tag.id}><Badge variant="outline">{tag.name}</Badge></li>
          ))}
        </ul>
      </footer>
    </article>
  );
}
