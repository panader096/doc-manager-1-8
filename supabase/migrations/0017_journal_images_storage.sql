-- Private bucket for journal entry images, one per entry, mirroring
-- the note-images pattern. Objects are stored at
-- {user_id}/{entry_id}/image.{ext}; storage.foldername(name) splits
-- on '/' excluding the filename, so [1] = owner's user_id.
--
-- Unlike note-images, there is no anon read exception here -- the
-- journal has no sharing feature and no anon surface anywhere.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('journal-images', 'journal-images', false, 5242880, array['image/png', 'image/jpeg', 'image/gif', 'image/webp']);

create policy "users manage own journal images" on storage.objects for all to authenticated
  using (bucket_id = 'journal-images' and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id = 'journal-images' and (storage.foldername(name))[1] = auth.uid()::text);
