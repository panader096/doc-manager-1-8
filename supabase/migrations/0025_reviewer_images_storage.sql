-- One optional image per Harry message (3b) -- separate bucket from
-- reviewer-docs, which is restricted to application/pdf only and holds
-- the chat's one grounding document, not per-message attachments.
alter table reviewer_messages add column image_path text;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('reviewer-images', 'reviewer-images', false, 5242880, array['image/png', 'image/jpeg', 'image/gif', 'image/webp']);

create policy "users manage own reviewer images" on storage.objects for all to authenticated
  using (bucket_id = 'reviewer-images' and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id = 'reviewer-images' and (storage.foldername(name))[1] = auth.uid()::text);
