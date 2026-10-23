import type { PostLanguage } from "@/features/posts/language";

export type PostStatus = "draft" | "published";

export type CategoryOption = Readonly<{
  id: string;
  name: string;
  depth: number;
}>;

export type TagOption = Readonly<{
  id: string;
  name: string;
}>;

export type AuthorOption = Readonly<{
  id: string;
  name: string;
}>;

export type TaxonomyOptions = Readonly<{
  categories: CategoryOption[];
  tags: TagOption[];
  authors: AuthorOption[];
  error: boolean;
}>;

export type AdminPostListRow = Readonly<{
  id: string;
  title: string;
  slug: string;
  status: PostStatus;
  revision: number;
  updatedAt: string;
  categoryName: string | null;
  authorNames: string[];
  createdBy: string | null;
}>;

export type AdminPostDetail = Readonly<{
  id: string;
  title: string;
  slug: string;
  excerpt: string | null;
  categoryId: string | null;
  categoryName: string | null;
  tagIds: string[];
  tagNames: string[];
  credits: { authorId: string; authorName: string; sortOrder: number }[];
  body: unknown;
  contentVersion: number;
  language: PostLanguage;
  status: PostStatus;
  revision: number;
  updatedAt: string;
  publishedAt: string | null;
  createdBy: string | null;
}>;

export type AdminPostListResult = Readonly<{
  posts: AdminPostListRow[];
  error: boolean;
}>;

export type AdminPostDetailResult = Readonly<{
  post: AdminPostDetail | null;
  error: boolean;
}>;
