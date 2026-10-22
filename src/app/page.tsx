import Link from "next/link";
import { ArrowRight } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
} from "@/components/ui/card";
import { PostMeta } from "@/features/posts/components/post-meta";
import { listPosts } from "@/features/posts/data";

export default function Home() {
  const posts = listPosts();

  return (
    <div className="mx-auto max-w-5xl px-6 py-12 sm:py-20">
      <section aria-labelledby="page-title" className="mb-12 max-w-2xl">
        <Badge variant="outline" className="mb-5">Örnek yayın</Badge>
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
        <div className="grid gap-6 md:grid-cols-2">
          {posts.map((post, index) => (
            <article key={post.id} className={index === 0 ? "md:col-span-2" : ""}>
              <Card className="h-full gap-5 p-2">
                <CardHeader className="gap-4 pt-4">
                  <span className="text-sm font-medium text-muted-foreground">
                    {post.category.name}
                  </span>
                  <h3 className="text-2xl leading-snug font-semibold tracking-tight">
                    <Link href={`/posts/${post.slug}`} className="rounded-sm hover:underline underline-offset-4">
                      {post.title}
                    </Link>
                  </h3>
                  <PostMeta post={post} />
                </CardHeader>
                <CardContent className="flex-1 space-y-5">
                  <p className="max-w-2xl leading-relaxed text-muted-foreground">
                    {post.excerpt}
                  </p>
                  <ul aria-label="Etiketler" className="flex flex-wrap gap-2">
                    {post.tags.map((tag) => (
                      <li key={tag.id}><Badge variant="secondary">{tag.name}</Badge></li>
                    ))}
                  </ul>
                </CardContent>
                <CardFooter className="justify-end bg-transparent">
                  <Button asChild variant="ghost">
                    <Link href={`/posts/${post.slug}`} aria-label={`${post.title} — yazıyı oku`}>
                      Yazıyı oku <ArrowRight aria-hidden="true" />
                    </Link>
                  </Button>
                </CardFooter>
              </Card>
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}
