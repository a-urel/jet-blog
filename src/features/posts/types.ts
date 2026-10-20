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

// Read-only sample view model, not a database schema or a Tiptap document.
export type Post = {
  id: string;
  slug: string;
  title: string;
  excerpt: string;
  publishedAt: string;
  authors: { author: Author; sortOrder: number }[];
  category: Category;
  tags: Tag[];
  sections: { heading: string; paragraphs: string[] }[];
};
