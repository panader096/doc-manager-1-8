-- Fixes the same class of critical confidentiality bug already fixed for
-- Harry's answer-sharing in 0027: the anon SELECT policies on
-- collections/notes/note_tags/tags (all gated by "share_token is not
-- null") let anyone list every currently-shared collection's full
-- content -- titles, note bodies, and the real share_token values
-- themselves -- via a direct table read, with no requirement to actually
-- hold a specific token. Replaced with two token-parameterized
-- SECURITY DEFINER RPCs that never return share_token and require the
-- exact token as an argument.
--
-- note_tags/tags anon policies are dropped entirely, not replaced --
-- SharedCollectionView.tsx never rendered tags in the first place, so
-- there is no need to expose them to anon at all.
drop policy "anon read shared collections" on collections;
drop policy "anon read notes in shared collections" on notes;
drop policy "anon read note_tags in shared collections" on note_tags;
drop policy "anon read tags in shared collections" on tags;

create or replace function get_shared_collection(p_token text)
returns table (id bigint, name text, created_at timestamptz)
language sql stable security definer
set search_path = public
as $$
  select collections.id, collections.name, collections.created_at
  from collections
  where collections.share_token = p_token
  limit 1;
$$;

create or replace function get_shared_collection_notes(p_token text)
returns table (
  id bigint,
  title text,
  body text,
  updated_at timestamptz,
  image_path text
)
language sql stable security definer
set search_path = public
as $$
  select notes.id, notes.title, notes.body, notes.updated_at, notes.image_path
  from notes
  join collections on collections.id = notes.collection_id
  where collections.share_token = p_token
    and notes.archived_at is null
  order by notes.updated_at desc;
$$;

revoke all on function get_shared_collection(text) from public;
revoke all on function get_shared_collection_notes(text) from public;
grant execute on function get_shared_collection(text) to anon, authenticated;
grant execute on function get_shared_collection_notes(text) to anon, authenticated;

-- Note-images Storage anon policy (0013/0014) is intentionally NOT
-- touched here. storage.objects RLS has no equivalent of an RPC
-- argument -- it can't be parameterized by a caller-supplied token the
-- way a SQL function can -- so a signed URL for a shared note's image
-- still can't be scoped tighter than "this object belongs to a note in
-- some currently-shared collection" without introducing a service-role
-- key, which this project's conventions explicitly forbid. This is a
-- narrower, already-documented residual (CLAUDE.md's Notes app schema
-- section calls it out as a deliberate anon exception), left as-is.
