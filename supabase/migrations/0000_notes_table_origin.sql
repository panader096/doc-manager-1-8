-- Origin migration for `notes`, recovered from supabase-test/ (an
-- untracked scratch project that was linked to this same live Supabase
-- project) and backfilled here so a fresh clone's migration history is
-- complete. Without this file, 0001_notes_rls_policies.sql creates
-- policies on a `notes` table that no tracked migration ever created.
--
-- The original scratch migration also enabled RLS with a single
-- permissive policy ("Notes are viewable by everyone", using (true)).
-- That policy and its anon-open successor ("anon select notes") no
-- longer exist -- they were replaced in 0009 and then fully redesigned
-- in 0011 -- so this migration intentionally does not recreate them.
-- Recreating a since-removed permissive policy here would silently
-- reopen anon SELECT access on an already-hardened table.

create table if not exists notes (
  id bigint primary key generated always as identity,
  title text not null,
  body text,
  created_at timestamptz not null default now()
);

alter table notes enable row level security;

-- `collections`, `tags`, and `note_tags` (renamed from mixed-case
-- "Collections"/"Tags"/"Note_tags" in 0002) were created directly in
-- the Supabase Studio dashboard, not via CLI migration -- no DDL for
-- their original creation exists in this repo or in supabase-test/.
-- That gap is not recoverable. RLS enablement is idempotent and safe
-- to assert defensively even though these tables already exist:
alter table collections enable row level security;
alter table tags enable row level security;
alter table note_tags enable row level security;
