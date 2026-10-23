-- Synthetic development seed. Never production data: names and bodies are
-- fictional, and upstream passwords are not created here.
-- Applied by `supabase db reset` when [db.seed] is enabled in config.toml.
-- Stable UUIDs mirror the read-only sample fixtures so Phase 8 can swap the
-- data boundary without changing URLs.

insert into public.categories (id, name, slug, description, parent_id, sort_order)
values
  (
    '2cf73ee8-509c-46c9-8e16-9c06abeb63d5',
    'Üretim',
    'uretim',
    'Birlikte üretmeye dair yazılar.',
    null,
    0
  ),
  (
    'e452c079-799d-4fde-96de-956b18ebc762',
    'Yazılım',
    'yazilim',
    'Yazılım geliştirme pratikleri.',
    '2cf73ee8-509c-46c9-8e16-9c06abeb63d5',
    0
  ),
  (
    'e622dbd4-af9b-476b-9e72-8ea26ebf3848',
    'Tasarım',
    'tasarim',
    'Arayüz ve okuma deneyimi.',
    null,
    1
  )
on conflict do nothing;

insert into public.tags (id, name, slug, description)
values
  ('ee5b127d-ed58-44bb-ae78-1565bb768081', 'Başlangıç', 'baslangic', null),
  ('e0212776-d644-4af9-b0bf-f16443224d6a', 'Birlikte üretmek', 'birlikte-uretmek', null),
  ('378afff8-b22e-437d-8501-916cf5e899bf', 'Erişilebilirlik', 'erisilebilirlik', null)
on conflict do nothing;

insert into public.authors (id, name, slug, bio)
values
  (
    'd1336179-612e-4c57-97cd-b5c176d816b3',
    'Deniz Örnek',
    'deniz-ornek',
    'Kurgusal bir yazar profili.'
  ),
  (
    '16f172fc-0708-4ca8-811c-662616945cb0',
    'Ece Örnek',
    'ece-ornek',
    'Kurgusal bir yazar profili.'
  )
on conflict do nothing;

insert into public.posts (
  id,
  title,
  slug,
  excerpt,
  category_id,
  status,
  published_at
)
values
  (
    'ce732bf7-e28c-41b4-983d-1c77663aaae8',
    'İyi bir başlangıç, küçük bir adımla mümkün',
    'kucuk-adimlarla-baslamak',
    'Her fikrin büyük bir plana ihtiyacı yok. Çalışan küçük bir parçayla başlamak, öğrenmek ve birlikte geliştirmek için alan açar.',
    'e452c079-799d-4fde-96de-956b18ebc762',
    'published',
    '2026-10-18T09:00:00+03:00'
  ),
  (
    '539106e1-38c4-4c92-b1f0-cbc791bfe168',
    'Bir yazı, birden fazla bakış açısı',
    'birlikte-yazmak',
    'Ortak bir metin üretirken farklı sesleri korumak ve yazarların katkısını görünür kılmak üzerine.',
    '2cf73ee8-509c-46c9-8e16-9c06abeb63d5',
    'published',
    '2026-10-16T11:30:00+03:00'
  ),
  (
    'b91d3983-5334-48b1-b849-3a368b6d3f6d',
    'Okumaya alan açan bir arayüz',
    'okumaya-alan-acmak',
    'Sade bir düzen, rahat satır aralıkları ve sistem tercihini izleyen renkler ile içeriği öne çıkarmak.',
    'e622dbd4-af9b-476b-9e72-8ea26ebf3848',
    'published',
    '2026-10-14T10:00:00+03:00'
  ),
  (
    '1f0b7c92-5a3d-4a1e-9c8b-2d6f4a7b0c31',
    'Yayına hazırlanan taslak',
    'taslak-yazi-ornegi',
    'Kategorisi ve yayın zamanı olmayan örnek taslak.',
    null,
    'draft',
    null
  )
on conflict do nothing;

insert into public.post_authors (post_id, author_id, sort_order)
values
  (
    'ce732bf7-e28c-41b4-983d-1c77663aaae8',
    'd1336179-612e-4c57-97cd-b5c176d816b3',
    0
  ),
  (
    'ce732bf7-e28c-41b4-983d-1c77663aaae8',
    '16f172fc-0708-4ca8-811c-662616945cb0',
    1
  ),
  (
    '539106e1-38c4-4c92-b1f0-cbc791bfe168',
    '16f172fc-0708-4ca8-811c-662616945cb0',
    0
  ),
  (
    '539106e1-38c4-4c92-b1f0-cbc791bfe168',
    'd1336179-612e-4c57-97cd-b5c176d816b3',
    1
  ),
  (
    'b91d3983-5334-48b1-b849-3a368b6d3f6d',
    'd1336179-612e-4c57-97cd-b5c176d816b3',
    0
  )
on conflict do nothing;

insert into public.post_tags (post_id, tag_id)
values
  ('ce732bf7-e28c-41b4-983d-1c77663aaae8', 'ee5b127d-ed58-44bb-ae78-1565bb768081'),
  ('ce732bf7-e28c-41b4-983d-1c77663aaae8', 'e0212776-d644-4af9-b0bf-f16443224d6a'),
  ('539106e1-38c4-4c92-b1f0-cbc791bfe168', 'e0212776-d644-4af9-b0bf-f16443224d6a'),
  ('b91d3983-5334-48b1-b849-3a368b6d3f6d', '378afff8-b22e-437d-8501-916cf5e899bf'),
  ('b91d3983-5334-48b1-b849-3a368b6d3f6d', 'ee5b127d-ed58-44bb-ae78-1565bb768081')
on conflict do nothing;

-- Sample post bodies in the stored version-1 document format.
update public.posts set body = '{"type":"doc","content":[{"type":"heading","attrs":{"level":2},"content":[{"type":"text","text":"Önce çalışan bir parça"}]},{"type":"paragraph","content":[{"type":"text","text":"Bu yazı, blog iskeletini keşfetmek için hazırlanmış örnek bir içeriktir. Buradaki kişi adları ve içerikler kurgusaldır."}]},{"type":"paragraph","content":[{"type":"text","text":"Bir fikri görünür kılmanın en sade yolu, küçük ama tamamlanmış bir parçasını üretmektir. Okunabilen bir sayfa ve anlaşılır bir yapı, sonraki kararları daha somut hale getirir."}]},{"type":"heading","attrs":{"level":2},"content":[{"type":"text","text":"Gelişmek için alan bırakmak"}]},{"type":"paragraph","content":[{"type":"text","text":"İlk adımda her ihtimali çözmek yerine, bugün ihtiyaç duyulan davranışları açıkça tanımlayabiliriz. Böylece yeni bilgiler geldiğinde yön değiştirmek kolaylaşır."}]},{"type":"paragraph","content":[{"type":"text","text":"Bir sonraki adım, editoryal sorumlulukları netleştirmek ve içerik üretiminin temel akışını birlikte tasarlamak olacak."}]}]}'::jsonb where id = 'ce732bf7-e28c-41b4-983d-1c77663aaae8';
update public.posts set body = '{"type":"doc","content":[{"type":"heading","attrs":{"level":2},"content":[{"type":"text","text":"Katkıyı görünür kılmak"}]},{"type":"paragraph","content":[{"type":"text","text":"Bir metin farklı deneyimlerin bir araya gelmesiyle zenginleşir. Yazarları belirli bir sırayla göstermek, bu katkıları okur için anlaşılır kılar."}]},{"type":"paragraph","content":[{"type":"text","text":"Yazar olarak görünmek ile içeriği düzenleme yetkisine sahip olmak aynı şey değildir. Bu örnek yalnızca yazar bilgisini sunar; herhangi bir yetki modeli tanımlamaz."}]}]}'::jsonb where id = '539106e1-38c4-4c92-b1f0-cbc791bfe168';
update public.posts set body = '{"type":"doc","content":[{"type":"heading","attrs":{"level":2},"content":[{"type":"text","text":"İçeriğe odaklanmak"}]},{"type":"paragraph","content":[{"type":"text","text":"Okuma deneyimini iyileştirmek için daha fazla araca değil, bazen daha az görsel gürültüye ihtiyaç duyarız. Belirgin başlıklar ve dengeli boşluklar metnin ritmini destekler."}]},{"type":"paragraph","content":[{"type":"text","text":"Açık ve koyu görünüm, cihazın tercihini otomatik olarak izler. Klavyeyle gezinirken bağlantıların odağı görünür kalır ve küçük ekranlarda içerik yatay kaydırma gerektirmeden okunabilir."}]}]}'::jsonb where id = 'b91d3983-5334-48b1-b849-3a368b6d3f6d';
update public.posts
set body = '{"type":"doc","content":[{"type":"heading","attrs":{"level":2},"content":[{"type":"text","text":"Taslak gövdesi"}]},{"type":"paragraph","content":[{"type":"text","text":"Bu taslak "},{"type":"text","marks":[{"type":"bold"}],"text":"biçimlendirilmiş"},{"type":"text","text":" bir örnek içerir ve "},{"type":"text","marks":[{"type":"link","attrs":{"href":"/posts/kucuk-adimlarla-baslamak"}}],"text":"yayındaki bir yazıya"},{"type":"text","text":" bağlantı verir."}]},{"type":"bulletList","content":[{"type":"listItem","content":[{"type":"paragraph","content":[{"type":"text","text":"Kategori seçilmedi"}]}]},{"type":"listItem","content":[{"type":"paragraph","content":[{"type":"text","text":"Yayın zamanı yok"}]}]}]}]}'::jsonb
where id = '1f0b7c92-5a3d-4a1e-9c8b-2d6f4a7b0c31';

-- The body updates above fire posts_set_updated_at, which would stamp every
-- published sample with the reset time and show it as recently updated.
-- Synthetic posts were neither created nor edited after publication, so align
-- both timestamps with published_at. Drafts keep the reset time.
alter table public.posts disable trigger posts_set_updated_at;

update public.posts
set created_at = published_at,
    updated_at = published_at
where status = 'published'
  and id in (
    'ce732bf7-e28c-41b4-983d-1c77663aaae8',
    '539106e1-38c4-4c92-b1f0-cbc791bfe168',
    'b91d3983-5334-48b1-b849-3a368b6d3f6d'
  );

alter table public.posts enable trigger posts_set_updated_at;
