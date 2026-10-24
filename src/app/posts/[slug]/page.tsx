import type { Metadata } from "next";
import Link from "next/link";
import { notFound, permanentRedirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { BookmarkProvider } from "@/features/bookmarks/components/bookmark-provider";
import { BookmarkToggle } from "@/features/bookmarks/components/bookmark-toggle";
import { CommentSection } from "@/features/comments/components/comment-section";
import { listVisibleComments } from "@/features/comments/data";
import { PostBody } from "@/features/posts/components/post-body";
import { PostCover } from "@/features/posts/components/post-cover";
import { PostMeta } from "@/features/posts/components/post-meta";
import { archivePaths, postPath } from "@/features/posts/archives";
import { findPublishedPost, listPublishedSlugs } from "@/features/posts/data";
import { buildArticleJsonLd, serializeJsonLd } from "@/features/seo/json-ld";
import { buildPostMetadata, noIndexMetadata } from "@/features/seo/metadata";
import { ShareControls } from "@/features/sharing/components/share-controls";
import { absoluteSiteUrl, getConfiguredSiteUrl, getSiteName } from "@/lib/site-url";

// Published posts are prerendered at build time; posts published later render
// on first request and are then cached (ISR). Publication Server Actions call
// revalidatePath("/posts/[slug]", "page"), so publish, edit, slug change, and
// unpublish are visible on the next request (archives and the sitemap are
// invalidated by the same actions). The interval is a fallback for
// out-of-band database changes. Only anonymous, RLS-filtered reads happen
// here; drafts and member previews (/admin/posts/[id]/preview, force-dynamic)
// never enter this cache. The bookmark toggle reads the visitor's own state in
// the browser after hydration, so the prerendered page stays identical for
// every visitor.
//
// Visible comments are part of this cached output (anonymous read, tagged per
// post; see src/features/comments/cache.ts). Comment Server Actions expire
// that post's comment tag and revalidate its literal path, so a new, deleted,
// hidden, or restored comment shows on the next request without regenerating
// other pages. Per-visitor comment controls load in the browser like the
// bookmark toggle.
export const revalidate = 300;

export async function generateStaticParams() {
  return (await listPublishedSlugs()).map((slug) => ({ slug }));
}

export async function generateMetadata({
  params,
}: PageProps<"/posts/[slug]">): Promise<Metadata> {
  const { slug } = await params;
  const lookup = await findPublishedPost(slug);
  // A redirecting old slug never renders, so only the current slug is
  // canonical; missing and unpublished slugs 404 with noindex.
  if (lookup.kind !== "post") return noIndexMetadata;

  return buildPostMetadata(lookup.post, getSiteName());
}

export default async function PostPage({ params }: PageProps<"/posts/[slug]">) {
  const { slug } = await params;
  const lookup = await findPublishedPost(slug);

  if (lookup.kind === "redirect") permanentRedirect(`/posts/${lookup.slug}`);
  if (lookup.kind === "missing") notFound();

  const { post } = lookup;
  const comments = await listVisibleComments(post.id);
  const siteUrl = getConfiguredSiteUrl();
  const shareUrl = absoluteSiteUrl(postPath(post.slug), siteUrl);
  const jsonLd = buildArticleJsonLd(post, { siteUrl, siteName: getSiteName() });

  return (
    <article className="mx-auto max-w-3xl px-6 py-10 sm:py-16">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: serializeJsonLd(jsonLd) }}
      />
      <Button asChild variant="ghost" className="mb-10">
        <Link href="/"><ArrowLeft aria-hidden="true" /> Tüm yazılar</Link>
      </Button>
      <header className="space-y-6 border-b pb-8">
        <Badge asChild variant="secondary">
          <Link href={archivePaths.category(post.category.slug)}>{post.category.name}</Link>
        </Badge>
        <h1
          lang={post.language}
          className="text-3xl leading-tight font-semibold tracking-tight sm:text-5xl"
        >
          {post.title}
        </h1>
        {post.excerpt ? (
          <p lang={post.language} className="text-lg leading-relaxed text-muted-foreground">
            {post.excerpt}
          </p>
        ) : null}
        <PostMeta post={post} />
        <BookmarkProvider postIds={[post.id]}>
          <BookmarkToggle postId={post.id} />
        </BookmarkProvider>
        {post.cover ? (
          <PostCover
            mediaId={post.cover.mediaId}
            alt={post.cover.alt}
            sizes="(min-width: 768px) 45rem, 100vw"
            preload
            className="rounded-xl"
          />
        ) : null}
      </header>
      <div lang={post.language} className="py-10">
        <PostBody body={post.body} contentVersion={post.contentVersion} />
      </div>
      <footer className="space-y-8 border-t pt-6">
        {post.tags.length > 0 ? (
          <div>
            <h2 className="mb-3 text-sm font-medium text-muted-foreground">Etiketler</h2>
            <ul className="flex flex-wrap gap-2">
              {post.tags.map((tag) => (
                <li key={tag.id}>
                  <Badge asChild variant="outline">
                    <Link href={archivePaths.tag(tag.slug)}>{tag.name}</Link>
                  </Badge>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
        {shareUrl ? <ShareControls url={shareUrl} title={post.title} /> : null}
      </footer>
      <div className="mt-10">
        <CommentSection postId={post.id} comments={comments} />
      </div>
    </article>
  );
}
