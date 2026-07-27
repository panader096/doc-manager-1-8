-- Fixes a critical confidentiality bug in 0026: the anon SELECT policies on
-- reviewer_shares and reviewer_messages allowed full enumeration of every
-- share (reviewer_shares had no filter at all -- using (true)) and did not
-- actually require presenting a token to read a shared message
-- (reviewer_messages only checked "was this message shared by anyone", not
-- "did the caller present the matching token"). Combined with plain
-- sequential bigint ids, this let an anonymous caller list every
-- share_token in the system, or simply guess small integers, bypassing the
-- "unguessable link" model entirely.
--
-- Replaced with a token-parameterized RPC, mirroring match_reviewer_chunks/
-- match_documents: the token must be supplied to get anything back,
-- share_token is never returned to the client, and anon has zero direct
-- SELECT grant on either table.
drop policy "anon read reviewer shares" on reviewer_shares;
drop policy "anon read shared reviewer message" on reviewer_messages;

create or replace function get_shared_reviewer_message(p_token text)
returns table (content text, created_at timestamptz)
language sql
security definer
set search_path = public
as $$
  select rm.content, rm.created_at
  from reviewer_shares rs
  join reviewer_messages rm on rm.id = rs.message_id
  where rs.share_token = p_token
  limit 1;
$$;

revoke all on function get_shared_reviewer_message(text) from public;
grant execute on function get_shared_reviewer_message(text) to anon, authenticated;
