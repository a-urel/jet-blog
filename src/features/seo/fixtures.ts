import type { PostSummary } from "@/features/posts/types";

export const coverMediaId = "99999999-9999-4999-8999-999999999999";
export const mediaOrigin = "https://media.example.test";

// Synthetic published post shared by the SEO unit tests.
export const publishedPost: PostSummary = {
  id: "11111111-1111-4111-8111-111111111111",
  slug: "ornek-yazi",
  title: "Örnek yazı",
  excerpt: "Kısa özet.",
  language: "tr",
  cover: null,
  publishedAt: "2026-10-20T09:00:00+00:00",
  updatedAt: "2026-10-21T10:30:00+00:00",
  authors: [
    { author: { id: "a1", name: "Birinci Yazar", slug: "birinci-yazar", avatarId: null }, sortOrder: 0 },
    { author: { id: "a2", name: "İkinci Yazar", slug: "ikinci-yazar", avatarId: null }, sortOrder: 1 },
  ],
  category: { id: "c2", name: "Yazılım", slug: "yazilim", parentId: "c1" },
  tags: [
    { id: "t1", name: "Başlangıç", slug: "baslangic" },
    { id: "t2", name: "Şema", slug: "sema" },
  ],
};

export const postWithCover: PostSummary = {
  ...publishedPost,
  cover: { mediaId: coverMediaId, alt: "Sisli bir vadi" },
};
