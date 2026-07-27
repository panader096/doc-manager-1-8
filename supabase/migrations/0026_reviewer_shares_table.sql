-- Public read-only sharing for a single Harry answer (3c), mirroring the
-- notes app's /shared/[token] pattern (a narrow, explicit anon exception,
-- not a blanket one) but scoped to one reviewer_messages row instead of a
-- whole collection.
create table reviewer_shares (
  id bigint primary key generated always as identity,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  message_id bigint not null references reviewer_messages(id) on delete cascade,
  share_token text not null unique,
  created_at timestamptz not null default now()
);

create index reviewer_shares_user_id_idx on reviewer_shares(user_id);
create index reviewer_shares_message_id_idx on reviewer_shares(message_id);

alter table reviewer_shares enable row level security;

create policy "reviewer_shares_owner_all"
on reviewer_shares for all to authenticated
using (auth.uid() = user_id)
with check (
  auth.uid() = user_id
  and exists (
    select 1 from reviewer_messages
    where reviewer_messages.id = reviewer_shares.message_id
      and reviewer_messages.user_id = auth.uid()
  )
);

-- Every row in this table IS an active share by construction (unlike
-- collections.share_token, which mixes shared/unshared rows in one table
-- gated by "share_token is not null") -- so an unconditional anon SELECT
-- here exposes the same class of metadata (which message_id is shared,
-- when) that the notes precedent already accepts, not a new or broader
-- exposure.
create policy "anon read reviewer shares" on reviewer_shares for select to anon
using (true);

-- The only anon read into reviewer_messages itself: exactly the rows that
-- have a matching reviewer_shares entry, nothing else. Does not grant
-- anything on reviewer_doc_chunks or the reviewer-docs bucket -- the
-- source PDF and its embedded chunks stay fully private.
create policy "anon read shared reviewer message" on reviewer_messages for select to anon
using (
  exists (
    select 1 from reviewer_shares
    where reviewer_shares.message_id = reviewer_messages.id
  )
);
