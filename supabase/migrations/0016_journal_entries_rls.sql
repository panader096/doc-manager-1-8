alter table journal_entries enable row level security;

create policy "journal_entries_owner_all"
on journal_entries for all to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);
