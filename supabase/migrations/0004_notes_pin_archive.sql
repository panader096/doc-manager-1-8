alter table notes add column pinned boolean not null default false;
alter table notes add column archived_at timestamptz;
