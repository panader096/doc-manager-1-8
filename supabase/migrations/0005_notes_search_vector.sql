alter table notes add column search_vector tsvector
  generated always as (to_tsvector('english', coalesce(title,'') || ' ' || coalesce(body,''))) stored;

create index notes_search_vector_idx on notes using gin (search_vector);
