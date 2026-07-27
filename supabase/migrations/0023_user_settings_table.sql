-- Per-user model preference for /chat and /harry (2c). One row per user,
-- created lazily on first read (getOrCreate pattern, same as
-- getOrCreateTodayEntry() in journal.ts) rather than at signup.
create table user_settings (
  user_id uuid primary key default auth.uid() references auth.users(id) on delete cascade,
  chat_model text not null default 'anthropic/claude-haiku-4.5',
  harry_model text not null default 'anthropic/claude-haiku-4.5',
  updated_at timestamptz not null default now()
);

alter table user_settings enable row level security;

create policy "user_settings_owner_all"
on user_settings for all to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);
