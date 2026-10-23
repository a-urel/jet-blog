import "server-only";

import { defaultPostLanguage, isPostLanguage } from "@/features/posts/language";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import type {
  AdminPostDetailResult,
  AdminPostListResult,
  AdminPostListRow,
  CategoryOption,
  PostStatus,
  TaxonomyOptions,
} from "./types";

type RelatedRecord<T> = T | T[] | null;

type RawCategory = {
  id: string;
  name: string;
  parent_id: string | null;
  sort_order: number;
};

type RawPost = {
  id: string;
  title: string;
  slug: string;
  excerpt: string | null;
  category_id: string | null;
  status: string;
  revision: number;
  updated_at: string;
  published_at: string | null;
  created_by: string | null;
  body?: unknown;
  content_version?: number;
  language?: string;
  category: RelatedRecord<{ name: string }>;
};

type RawCredit = {
  post_id: string;
  sort_order: number;
  author: RelatedRecord<{ id: string; name: string }>;
};

type RawTagRelation = {
  post_id: string;
  tag: RelatedRecord<{ id: string; name: string }>;
};

function firstRelated<T>(value: RelatedRecord<T>): T | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

function isPostStatus(value: string): value is PostStatus {
  return value === "draft" || value === "published";
}

function buildCategoryOptions(rows: RawCategory[]): CategoryOption[] {
  const byParent = new Map<string | null, RawCategory[]>();

  for (const row of rows) {
    const siblings = byParent.get(row.parent_id) ?? [];
    siblings.push(row);
    byParent.set(row.parent_id, siblings);
  }

  for (const siblings of byParent.values()) {
    siblings.sort(
      (left, right) =>
        left.sort_order - right.sort_order ||
        left.name.localeCompare(right.name, "tr"),
    );
  }

  const options: CategoryOption[] = [];
  const visited = new Set<string>();

  function visit(parentId: string | null, depth: number) {
    for (const row of byParent.get(parentId) ?? []) {
      if (visited.has(row.id)) continue;
      visited.add(row.id);
      options.push({ id: row.id, name: row.name, depth });
      visit(row.id, depth + 1);
    }
  }

  visit(null, 0);

  // A corrupt cycle should not hide categories from the form. Append anything
  // the tree walk could not reach at the root level.
  for (const row of rows) {
    if (!visited.has(row.id)) {
      options.push({ id: row.id, name: row.name, depth: 0 });
    }
  }

  return options;
}

export async function listTaxonomyOptions(): Promise<TaxonomyOptions> {
  const supabase = await createServerSupabaseClient();
  const [categories, tags, authors] = await Promise.all([
    supabase
      .from("categories")
      .select("id, name, parent_id, sort_order")
      .order("sort_order", { ascending: true })
      .order("name", { ascending: true }),
    supabase
      .from("tags")
      .select("id, name")
      .order("name", { ascending: true }),
    supabase
      .from("authors")
      .select("id, name")
      .order("name", { ascending: true }),
  ]);

  if (categories.error || tags.error || authors.error) {
    return {
      categories: [],
      tags: [],
      authors: [],
      error: true,
    };
  }

  return {
    categories: buildCategoryOptions(
      (categories.data ?? []) as unknown as RawCategory[],
    ),
    tags: ((tags.data ?? []) as { id: string; name: string }[]).map((tag) => ({
      id: tag.id,
      name: tag.name,
    })),
    authors: (
      (authors.data ?? []) as { id: string; name: string }[]
    ).map((author) => ({ id: author.id, name: author.name })),
    error: false,
  };
}

export async function listAdminPosts(): Promise<AdminPostListResult> {
  const supabase = await createServerSupabaseClient();
  const [postsResult, creditsResult] = await Promise.all([
    supabase
      .from("posts")
      .select(
        "id, title, slug, status, revision, updated_at, created_by, category:categories(name)",
      )
      .order("updated_at", { ascending: false }),
    supabase
      .from("post_authors")
      .select("post_id, sort_order, author:authors(id, name)")
      .order("sort_order", { ascending: true }),
  ]);

  if (postsResult.error || creditsResult.error) {
    return { posts: [], error: true };
  }

  const creditsByPost = new Map<string, RawCredit[]>();

  for (const credit of (creditsResult.data ?? []) as unknown as RawCredit[]) {
    const list = creditsByPost.get(credit.post_id) ?? [];
    list.push(credit);
    creditsByPost.set(credit.post_id, list);
  }

  const posts: AdminPostListRow[] = [];

  for (const raw of (postsResult.data ?? []) as unknown as RawPost[]) {
    if (!isPostStatus(raw.status)) continue;

    const credits = (creditsByPost.get(raw.id) ?? []).sort(
      (left, right) => left.sort_order - right.sort_order,
    );

    posts.push({
      id: raw.id,
      title: raw.title,
      slug: raw.slug,
      status: raw.status,
      revision: raw.revision,
      updatedAt: raw.updated_at,
      categoryName: firstRelated(raw.category)?.name ?? null,
      authorNames: credits.flatMap((credit) => {
        const author = firstRelated(credit.author);
        return author ? [author.name] : [];
      }),
      createdBy: raw.created_by ?? null,
    });
  }

  return { posts, error: false };
}

export async function getAdminPostDetail(
  postId: string,
): Promise<AdminPostDetailResult> {
  const supabase = await createServerSupabaseClient();
  const postResult = await supabase
    .from("posts")
    .select(
      "id, title, slug, excerpt, category_id, status, revision, updated_at, published_at, created_by, body, content_version, language, category:categories(name)",
    )
    .eq("id", postId)
    .maybeSingle();

  if (postResult.error) return { post: null, error: true };
  if (!postResult.data) return { post: null, error: false };

  const raw = postResult.data as unknown as RawPost;

  const [creditsResult, tagsResult] = await Promise.all([
    supabase
      .from("post_authors")
      .select("post_id, sort_order, author:authors(id, name)")
      .eq("post_id", postId)
      .order("sort_order", { ascending: true }),
    supabase
      .from("post_tags")
      .select("post_id, tag:tags(id, name)")
      .eq("post_id", postId),
  ]);

  if (creditsResult.error || tagsResult.error || !isPostStatus(raw.status)) {
    return { post: null, error: true };
  }

  const credits = (
    (creditsResult.data ?? []) as unknown as RawCredit[]
  ).flatMap((credit) => {
    const author = firstRelated(credit.author);
    return author
      ? [
          {
            authorId: author.id,
            authorName: author.name,
            sortOrder: credit.sort_order,
          },
        ]
      : [];
  });

  const tags = ((tagsResult.data ?? []) as unknown as RawTagRelation[])
    .flatMap((relation) => {
      const tag = firstRelated(relation.tag);
      return tag ? [tag] : [];
    })
    .sort((left, right) => left.name.localeCompare(right.name, "tr"));

  return {
    post: {
      id: raw.id,
      title: raw.title,
      slug: raw.slug,
      excerpt: raw.excerpt,
      categoryId: raw.category_id,
      categoryName: firstRelated(raw.category)?.name ?? null,
      tagIds: tags.map((tag) => tag.id),
      tagNames: tags.map((tag) => tag.name),
      credits,
      body: raw.body ?? null,
      contentVersion: raw.content_version ?? 0,
      language: isPostLanguage(raw.language) ? raw.language : defaultPostLanguage,
      status: raw.status,
      revision: raw.revision,
      updatedAt: raw.updated_at,
      publishedAt: raw.published_at,
      createdBy: raw.created_by,
    },
    error: false,
  };
}
