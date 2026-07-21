create table chat_messages (
  id bigint primary key generated always as identity,
  user_id uuid not null default auth.uid() references auth.users(id),
  role text not null check (role in ('user', 'assistant')),
  content text not null,
  created_at timestamptz not null default now()
);

alter table chat_messages enable row level security;

create policy "chat_messages_owner_all"
on chat_messages for all to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);
