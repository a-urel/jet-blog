import type { PostLanguage } from "./language";

export type Author = {
  id: string;
  name: string;
  slug: string;
};

export type Category = {
  id: string;
  name: string;
  slug: string;
  parentId: string | null;
};

export type Tag = {
  id: string;
  name: string;
  slug: string;
};

// A post's cover reference with the alt text of this occurrence.
export type PostCoverImage = {
  mediaId: string;
  alt: string;
};

// Public read model for a published post. It never carries editorial fields
// such as revision, created_by, or status.
export type PostSummary = {
  id: string;
  slug: string;
  title: string;
  excerpt: string | null;
  language: PostLanguage;
  cover: PostCoverImage | null;
  publishedAt: string;
  updatedAt: string;
  authors: { author: Author; sortOrder: number }[];
  category: Category;
  tags: Tag[];
};

// The body stays unknown until the shared renderer validates it.
export type Post = PostSummary & {
  body: unknown;
  contentVersion: number;
};
