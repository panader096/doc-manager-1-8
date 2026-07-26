-- Vector store for "chat with your own notes" (Sprint 3.7 - RAG).
-- Each row is one embedded chunk of a note's body. Follows Supabase's
-- vector-columns / semantic-search docs: pgvector lives in the
-- `extensions` schema (not `public`), and `documents.embedding` is sized
-- for openai/text-embedding-3-small (1536 dims) -- see the Embeddings
-- section of CLAUDE.md; don't change this dimension without a full
-- drop-and-re-embed.

create extension if not exists vector with schema extensions;

create table documents (
  id bigint primary key generated always as identity,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  note_id bigint not null references notes(id) on delete cascade,
  content text not null,
  embedding extensions.vector(1536),
  created_at timestamptz not null default now()
);

-- Every RLS-scoped query on this table filters by user_id -- same
-- indexing convention as notes/collections/tags in 0010.
create index documents_user_id_idx on documents(user_id);

alter table documents enable row level security;

create policy "documents_owner_all"
on documents for all to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

-- security invoker (the default -- stated explicitly here) so this
-- function runs as the calling user and RLS still applies; p_user_id is
-- passed explicitly (rather than relying on auth.uid() alone) so the
-- same function also works from a service-role context, e.g. a
-- background re-embedding job.
create or replace function match_documents (
  query_embedding extensions.vector(1536),
  match_threshold float,
  match_count int,
  p_user_id uuid
)
returns table (
  id bigint,
  note_id bigint,
  content text,
  similarity float
)
language sql stable security invoker
set search_path = public, extensions
as $$
  select
    documents.id,
    documents.note_id,
    documents.content,
    1 - (documents.embedding <=> query_embedding) as similarity
  from documents
  where documents.user_id = p_user_id
    and 1 - (documents.embedding <=> query_embedding) > match_threshold
  order by documents.embedding <=> query_embedding asc
  limit least(match_count, 200);
$$;
