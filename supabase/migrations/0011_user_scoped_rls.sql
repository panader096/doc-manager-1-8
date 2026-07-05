begin;

-- Drop every anon-open policy from the earlier anon-shared design.
drop policy "anon select notes" on notes;
drop policy "anon insert notes" on notes;
drop policy "anon update notes" on notes;
drop policy "anon delete notes" on notes;

drop policy "anon select collections" on collections;
drop policy "anon insert collections" on collections;
drop policy "anon update collections" on collections;
drop policy "anon delete collections" on collections;

drop policy "anon select tags" on tags;
drop policy "anon insert tags" on tags;
drop policy "anon update tags" on tags;
drop policy "anon delete tags" on tags;

drop policy "anon select note_tags" on note_tags;
drop policy "anon insert note_tags" on note_tags;
drop policy "anon delete note_tags" on note_tags;

drop policy "anon select search_history" on search_history;
drop policy "anon insert search_history" on search_history;
drop policy "anon update search_history" on search_history;
drop policy "anon delete search_history" on search_history;

-- Owner-scoped policies: a signed-in user manages only their own rows.
create policy "users manage own notes" on notes for all to authenticated
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "users manage own collections" on collections for all to authenticated
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "users manage own tags" on tags for all to authenticated
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "users manage own search_history" on search_history for all to authenticated
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- note_tags has no user_id of its own; ownership follows the note (and,
-- on insert/update, the tag too -- a user can't link their own note to
-- someone else's tag row).
create policy "users manage own note_tags" on note_tags for all to authenticated
  using (
    exists (select 1 from notes where notes.id = note_tags.note_id and notes.user_id = auth.uid())
  )
  with check (
    exists (select 1 from notes where notes.id = note_tags.note_id and notes.user_id = auth.uid())
    and exists (select 1 from tags where tags.id = note_tags.tag_id and tags.user_id = auth.uid())
  );

-- Narrow, explicit anon read-only exception so /shared/[token] keeps
-- working for anonymous visitors -- not blanket anon access, just this
-- one documented carve-out.
create policy "anon read shared collections" on collections for select to anon
  using (share_token is not null);

create policy "anon read notes in shared collections" on notes for select to anon
  using (collection_id in (select id from collections where share_token is not null));

create policy "anon read note_tags in shared collections" on note_tags for select to anon
  using (note_id in (
    select n.id from notes n
    join collections c on c.id = n.collection_id
    where c.share_token is not null
  ));

create policy "anon read tags in shared collections" on tags for select to anon
  using (id in (
    select nt.tag_id from note_tags nt
    join notes n on n.id = nt.note_id
    join collections c on c.id = n.collection_id
    where c.share_token is not null
  ));

commit;
