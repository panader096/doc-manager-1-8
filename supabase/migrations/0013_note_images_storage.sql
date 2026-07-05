-- Private bucket for note images. Objects are stored at
-- {user_id}/{note_id}/image.{ext}; storage.foldername(name) splits on
-- '/' excluding the filename, so [1] = owner's user_id, [2] = note id.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('note-images', 'note-images', false, 5242880, array['image/png', 'image/jpeg', 'image/gif', 'image/webp']);

-- Owner-scoped policy, consolidated like the "users manage own X"
-- policies in 0011 -- the folder-ownership predicate is identical
-- across select/insert/update/delete here.
create policy "users manage own note images" on storage.objects for all to authenticated
  using (bucket_id = 'note-images' and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id = 'note-images' and (storage.foldername(name))[1] = auth.uid()::text);

-- Narrow anon read exception extending the existing /shared/[token]
-- carve-out (0011) to cover images on notes within a shared collection.
create policy "anon read images in shared collections" on storage.objects for select to anon
  using (
    bucket_id = 'note-images'
    and exists (
      select 1 from notes n
      join collections c on c.id = n.collection_id
      where c.share_token is not null and n.id::text = (storage.foldername(name))[2]
    )
  );
