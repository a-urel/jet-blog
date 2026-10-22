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
