-- One optional image per chat message (3b), matching the note-images /
-- journal-images pattern: private bucket, path scoped to the owning user,
-- never base64 in the database.
alter table chat_messages add column image_path text;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('chat-images', 'chat-images', false, 5242880, array['image/png', 'image/jpeg', 'image/gif', 'image/webp']);

create policy "users manage own chat images" on storage.objects for all to authenticated
  using (bucket_id = 'chat-images' and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id = 'chat-images' and (storage.foldername(name))[1] = auth.uid()::text);
