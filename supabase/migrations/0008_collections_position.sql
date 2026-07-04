alter table collections add column position integer;

with ordered as (
  select id, row_number() over (order by name) as rn from collections
)
update collections set position = ordered.rn from ordered where collections.id = ordered.id;

alter table collections alter column position set not null;
