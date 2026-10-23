import type { Metadata } from "next";

import { PostList } from "@/features/posts/components/post-list";
import { listPublishedPosts } from "@/features/posts/data";

// Prerendered from published rows and regenerated on demand: publication
// Server Actions call revalidatePath("/"). The interval is only a fallback for
// changes made outside the application (for example service-role scripts).
export const revalidate = 300;

export const metadata: Metadata = {
  alternates: { canonical: "/" },
};

export default async function Home() {
  const posts = await listPublishedPosts();

  return (
    <div className="mx-auto max-w-5xl px-6 py-12 sm:py-20">
      <section aria-labelledby="page-title" className="mb-12 max-w-2xl">
        <h1 id="page-title" className="text-4xl leading-tight font-semibold tracking-tight sm:text-5xl">
          Fikirler paylaştıkça büyür.
        </h1>
        <p className="mt-5 text-lg leading-relaxed text-muted-foreground">
          Tasarım, teknoloji ve üretmek üzerine notlar. Farklı bakış açılarını
          bir araya getiren küçük bir okuma alanı.
        </p>
      </section>

      <section aria-labelledby="posts-title">
        <div className="mb-6 flex items-baseline justify-between gap-4 border-b pb-4">
          <h2 id="posts-title" className="text-xl font-semibold">Son yazılar</h2>
          <span className="text-sm text-muted-foreground">{posts.length} yazı</span>
        </div>
        {posts.length === 0 ? (
          <p className="rounded-lg border border-dashed px-4 py-10 text-center text-muted-foreground">
            Henüz yayınlanmış bir yazı yok.
          </p>
        ) : null}
        <PostList posts={posts} />
      </section>
    </div>
  );
}
