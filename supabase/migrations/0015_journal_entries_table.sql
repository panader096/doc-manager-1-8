-- The journal_entries table that already exists on the linked remote
-- project was created ad hoc via Studio, not through a tracked
-- migration, and is missing user_id, entry_date, and search_vector,
-- has no identity default on id, and has the wrong type on
-- updated_at. Drop and recreate rather than ALTER, since the table
-- is empty (confirmed via REST: anon SELECT returns []) -- there is
-- no data to preserve.

drop table if exists journal_entries;

create table journal_entries (
  id bigint primary key generated always as identity,
  user_id uuid not null default auth.uid() references auth.users(id),
  entry_date date not null default current_date,
  title text,
  body text,
  image_path text,
  search_vector tsvector
    generated always as (to_tsvector('english', coalesce(title,'') || ' ' || coalesce(body,''))) stored,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, entry_date)
);

create index journal_entries_search_vector_idx on journal_entries using gin (search_vector);
