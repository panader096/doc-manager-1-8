-- Private bucket for the signed-in user's own profile photo, one per
-- user. No table needed: the photo's existence and path are looked
-- up via storage.objects.list() by convention (there is at most one
-- object per user's folder), rather than tracked in a `profiles`
-- table. Objects are stored at {user_id}/photo.{ext}.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('profile-photos', 'profile-photos', false, 5242880, array['image/png', 'image/jpeg', 'image/gif', 'image/webp']);

create policy "users manage own profile photo" on storage.objects for all to authenticated
  using (bucket_id = 'profile-photos' and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id = 'profile-photos' and (storage.foldername(name))[1] = auth.uid()::text);
