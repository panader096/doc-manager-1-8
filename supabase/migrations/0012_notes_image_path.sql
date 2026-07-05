-- One optional image per note, stored in Supabase Storage (not base64).
-- This column holds the Storage object path, not a public URL --
-- rendering goes through a signed URL generated on demand.

alter table notes add column image_path text;
