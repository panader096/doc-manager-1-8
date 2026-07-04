-- Rename mixed-case tables to match the lowercase `notes` convention
alter table "Collections" rename to collections;
alter table "Tags" rename to tags;
alter table "Note_tags" rename to note_tags;

-- Stray FK: a tag's own id should not be constrained to a collection id
alter table tags drop constraint "Tags_id_fkey";

-- collections.created_at has no default (same gap notes.updated_at had)
alter table collections alter column created_at set default now();

-- note_tags currently has no primary key, so duplicate tag assignments
-- are possible; add one and index tag_id for the tag-filter query
alter table note_tags add constraint note_tags_pkey primary key (note_id, tag_id);
create index note_tags_tag_id_idx on note_tags (tag_id);
create index notes_collection_id_idx on notes (collection_id);

-- RLS: these tables had no SELECT policy for anon at all (plain GET just
-- returned an empty array either way, indistinguishable from "no rows" —
-- but INSERT ... RETURNING needs to re-select the new row and fails with
-- the same 42501 error when it can't). Add read policies plus the same
-- write policies notes already has.
create policy "anon select collections" on collections for select to anon using (true);
create policy "anon select tags" on tags for select to anon using (true);
create policy "anon select note_tags" on note_tags for select to anon using (true);

create policy "anon insert collections" on collections for insert to anon with check (true);
create policy "anon update collections" on collections for update to anon using (true) with check (true);
create policy "anon delete collections" on collections for delete to anon using (true);

create policy "anon insert tags" on tags for insert to anon with check (true);
create policy "anon update tags" on tags for update to anon using (true) with check (true);
create policy "anon delete tags" on tags for delete to anon using (true);

create policy "anon insert note_tags" on note_tags for insert to anon with check (true);
create policy "anon delete note_tags" on note_tags for delete to anon using (true);
