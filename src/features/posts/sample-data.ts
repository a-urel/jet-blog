import type { Author, Category, Post, Tag } from "./types";

const deniz: Author = {
  id: "d1336179-612e-4c57-97cd-b5c176d816b3",
  name: "Deniz Örnek",
};
const ece: Author = {
  id: "16f172fc-0708-4ca8-811c-662616945cb0",
  name: "Ece Örnek",
};

export const sampleCategories: Category[] = [
  { id: "2cf73ee8-509c-46c9-8e16-9c06abeb63d5", name: "Üretim", parentId: null },
  {
    id: "e452c079-799d-4fde-96de-956b18ebc762",
    name: "Yazılım",
    parentId: "2cf73ee8-509c-46c9-8e16-9c06abeb63d5",
  },
  { id: "e622dbd4-af9b-476b-9e72-8ea26ebf3848", name: "Tasarım", parentId: null },
];

const tags: Tag[] = [
  { id: "ee5b127d-ed58-44bb-ae78-1565bb768081", name: "Başlangıç" },
  { id: "e0212776-d644-4af9-b0bf-f16443224d6a", name: "Birlikte üretmek" },
  { id: "378afff8-b22e-437d-8501-916cf5e899bf", name: "Erişilebilirlik" },
];

export const samplePosts: Post[] = [
  {
    id: "ce732bf7-e28c-41b4-983d-1c77663aaae8",
    slug: "kucuk-adimlarla-baslamak",
    title: "İyi bir başlangıç, küçük bir adımla mümkün",
    excerpt:
      "Her fikrin büyük bir plana ihtiyacı yok. Çalışan küçük bir parçayla başlamak, öğrenmek ve birlikte geliştirmek için alan açar.",
    publishedAt: "2026-10-18T09:00:00+03:00",
    authors: [{ author: deniz, sortOrder: 0 }, { author: ece, sortOrder: 1 }],
    category: sampleCategories[1],
    tags: [tags[0], tags[1]],
    sections: [
      {
        heading: "Önce çalışan bir parça",
        paragraphs: [
          "Bu yazı, blog iskeletini keşfetmek için hazırlanmış örnek bir içeriktir. Buradaki kişi adları ve içerikler kurgusaldır; herhangi bir veri tabanından gelmez.",
          "Bir fikri görünür kılmanın en sade yolu, küçük ama tamamlanmış bir parçasını üretmektir. Okunabilen bir sayfa ve anlaşılır bir yapı, sonraki kararları daha somut hale getirir.",
        ],
      },
      {
        heading: "Gelişmek için alan bırakmak",
        paragraphs: [
          "İlk adımda her ihtimali çözmek yerine, bugün ihtiyaç duyulan davranışları açıkça tanımlayabiliriz. Böylece yeni bilgiler geldiğinde yön değiştirmek kolaylaşır.",
          "Bir sonraki adım, editoryal sorumlulukları netleştirmek ve içerik üretiminin temel akışını birlikte tasarlamak olacak.",
        ],
      },
    ],
  },
  {
    id: "539106e1-38c4-4c92-b1f0-cbc791bfe168",
    slug: "birlikte-yazmak",
    title: "Bir yazı, birden fazla bakış açısı",
    excerpt:
      "Ortak bir metin üretirken farklı sesleri korumak ve yazarların katkısını görünür kılmak üzerine.",
    publishedAt: "2026-10-16T11:30:00+03:00",
    authors: [{ author: ece, sortOrder: 0 }, { author: deniz, sortOrder: 1 }],
    category: sampleCategories[0],
    tags: [tags[1]],
    sections: [
      {
        heading: "Katkıyı görünür kılmak",
        paragraphs: [
          "Bir metin farklı deneyimlerin bir araya gelmesiyle zenginleşir. Yazarları belirli bir sırayla göstermek, bu katkıları okur için anlaşılır kılar.",
          "Yazar olarak görünmek ile içeriği düzenleme yetkisine sahip olmak aynı şey değildir. Bu örnek yalnızca yazar bilgisini sunar; herhangi bir yetki modeli tanımlamaz.",
        ],
      },
    ],
  },
  {
    id: "b91d3983-5334-48b1-b849-3a368b6d3f6d",
    slug: "okumaya-alan-acmak",
    title: "Okumaya alan açan bir arayüz",
    excerpt:
      "Sade bir düzen, rahat satır aralıkları ve sistem tercihini izleyen renkler ile içeriği öne çıkarmak.",
    publishedAt: "2026-10-14T10:00:00+03:00",
    authors: [{ author: deniz, sortOrder: 0 }],
    category: sampleCategories[2],
    tags: [tags[2], tags[0]],
    sections: [
      {
        heading: "İçeriğe odaklanmak",
        paragraphs: [
          "Okuma deneyimini iyileştirmek için daha fazla araca değil, bazen daha az görsel gürültüye ihtiyaç duyarız. Belirgin başlıklar ve dengeli boşluklar metnin ritmini destekler.",
          "Açık ve koyu görünüm, cihazın tercihini otomatik olarak izler. Klavyeyle gezinirken bağlantıların odağı görünür kalır ve küçük ekranlarda içerik yatay kaydırma gerektirmeden okunabilir.",
        ],
      },
    ],
  },
];
