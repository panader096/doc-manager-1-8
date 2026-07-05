-- Scope notes/collections/tags/search_history to the signed-in user.
-- Existing anon-created rows are backfilled to the confirmed real
-- account (paulbakker90@gmail.com) rather than wiped.

alter table notes add column user_id uuid references auth.users(id) on delete cascade;
update notes set user_id = '33349fba-656b-4277-b634-fd77945704f3' where user_id is null;
alter table notes alter column user_id set not null;
alter table notes alter column user_id set default auth.uid();
create index notes_user_id_idx on notes(user_id);

alter table collections add column user_id uuid references auth.users(id) on delete cascade;
update collections set user_id = '33349fba-656b-4277-b634-fd77945704f3' where user_id is null;
alter table collections alter column user_id set not null;
alter table collections alter column user_id set default auth.uid();
create index collections_user_id_idx on collections(user_id);

alter table tags add column user_id uuid references auth.users(id) on delete cascade;
update tags set user_id = '33349fba-656b-4277-b634-fd77945704f3' where user_id is null;
alter table tags alter column user_id set not null;
alter table tags alter column user_id set default auth.uid();
create index tags_user_id_idx on tags(user_id);

-- search_history's uniqueness was on query alone, which would let two
-- different users' searches collide on upsert; make it per-user.
alter table search_history add column user_id uuid references auth.users(id) on delete cascade;
update search_history set user_id = '33349fba-656b-4277-b634-fd77945704f3' where user_id is null;
alter table search_history alter column user_id set not null;
alter table search_history alter column user_id set default auth.uid();
drop index search_history_query_idx;
create unique index search_history_user_query_idx on search_history(user_id, query);
