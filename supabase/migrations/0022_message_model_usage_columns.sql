-- Per-message model/usage metadata for transparency (1a) and a token-count
-- indicator (1c). Nullable: user-role rows never have these, and existing
-- assistant rows predate this migration.
alter table chat_messages add column model text;
alter table chat_messages add column total_tokens integer;

alter table reviewer_messages add column model text;
alter table reviewer_messages add column total_tokens integer;
