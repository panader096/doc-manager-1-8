create table search_history (
  id bigint generated always as identity primary key,
  query text not null,
  searched_at timestamptz not null default now()
);
create unique index search_history_query_idx on search_history (query);

alter table search_history enable row level security;
create policy "anon select search_history" on search_history for select to anon using (true);
create policy "anon insert search_history" on search_history for insert to anon with check (true);
create policy "anon update search_history" on search_history for update to anon using (true) with check (true);
create policy "anon delete search_history" on search_history for delete to anon using (true);
