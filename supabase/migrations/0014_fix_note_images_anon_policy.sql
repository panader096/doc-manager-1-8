-- 0013's anon exception referenced bare `name` inside the EXISTS
-- subquery, which Postgres resolved to collections.name (also named
-- `name`) instead of the intended correlated storage.objects.name --
-- silently matching nothing. Qualify it explicitly.

drop policy "anon read images in shared collections" on storage.objects;

create policy "anon read images in shared collections" on storage.objects for select to anon
  using (
    bucket_id = 'note-images'
    and exists (
      select 1 from notes n
      join collections c on c.id = n.collection_id
      where c.share_token is not null and n.id::text = (storage.foldername(objects.name))[2]
    )
  );
