-- Schema for "Sprint 3.8 - Intelligent Doc Reviewer" (Harry): multiple
-- named per-user chats, each scoped to exactly one uploaded PDF. Mirrors
-- the notes-app RAG pattern (migration 0020) but as its own table set --
-- chunks here belong to a chat's document, not a note, and need a page
-- number, which the notes `documents` table doesn't have.

create table reviewer_chats (
  id bigint primary key generated always as identity,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  title text not null,
  doc_filename text not null,
  doc_path text not null default '',
  doc_status text not null default 'processing' check (doc_status in ('processing', 'ready', 'failed')),
  doc_status_reason text,
  created_at timestamptz not null default now()
);

create index reviewer_chats_user_id_idx on reviewer_chats(user_id);

alter table reviewer_chats enable row level security;

create policy "reviewer_chats_owner_all"
on reviewer_chats for all to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

create table reviewer_messages (
  id bigint primary key generated always as identity,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  chat_id bigint not null references reviewer_chats(id) on delete cascade,
  role text not null check (role in ('user', 'assistant')),
  content text not null,
  created_at timestamptz not null default now()
);

create index reviewer_messages_chat_id_idx on reviewer_messages(chat_id);

alter table reviewer_messages enable row level security;

create policy "reviewer_messages_owner_all"
on reviewer_messages for all to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

create table reviewer_doc_chunks (
  id bigint primary key generated always as identity,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  chat_id bigint not null references reviewer_chats(id) on delete cascade,
  page int not null,
  content text not null,
  embedding extensions.vector(1536)
);

create index reviewer_doc_chunks_chat_id_idx on reviewer_doc_chunks(chat_id);

alter table reviewer_doc_chunks enable row level security;

create policy "reviewer_doc_chunks_owner_all"
on reviewer_doc_chunks for all to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

-- security invoker (the default -- stated explicitly) so RLS still
-- applies to the caller; search_path is set explicitly because the
-- <=> operator lives in the extensions schema -- migration 0020 shipped
-- without this and failed on push until fixed, see that migration.
create or replace function match_reviewer_chunks (
  query_embedding extensions.vector(1536),
  match_threshold float,
  match_count int,
  p_user_id uuid,
  p_chat_id bigint
)
returns table (
  id bigint,
  page int,
  content text,
  similarity float
)
language sql stable security invoker
set search_path = public, extensions
as $$
  select
    reviewer_doc_chunks.id,
    reviewer_doc_chunks.page,
    reviewer_doc_chunks.content,
    1 - (reviewer_doc_chunks.embedding <=> query_embedding) as similarity
  from reviewer_doc_chunks
  where reviewer_doc_chunks.user_id = p_user_id
    and reviewer_doc_chunks.chat_id = p_chat_id
    and 1 - (reviewer_doc_chunks.embedding <=> query_embedding) > match_threshold
  order by reviewer_doc_chunks.embedding <=> query_embedding asc
  limit least(match_count, 200);
$$;

-- Private bucket for uploaded PDFs, one per chat, at
-- {user_id}/{chat_id}/document.pdf -- same owner-folder pattern as
-- note-images/journal-images. No anon policy: no sharing feature here.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('reviewer-docs', 'reviewer-docs', false, 20971520, array['application/pdf']);

create policy "users manage own reviewer docs" on storage.objects for all to authenticated
  using (bucket_id = 'reviewer-docs' and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id = 'reviewer-docs' and (storage.foldername(name))[1] = auth.uid()::text);
