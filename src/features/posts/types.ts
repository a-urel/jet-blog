export type Author = {
  id: string;
  name: string;
};

export type Category = {
  id: string;
  name: string;
  parentId: string | null;
};

export type Tag = {
  id: string;
  name: string;
};

// Public read model for a published post. It never carries editorial fields
// such as revision, created_by, or status.
export type PostSummary = {
  id: string;
  slug: string;
  title: string;
  excerpt: string | null;
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
