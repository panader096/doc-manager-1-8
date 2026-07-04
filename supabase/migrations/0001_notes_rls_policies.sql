-- Allow the anon role full read/write access to notes.
-- This is a single-user personal app with no auth layer, so access
-- control happens at the network/deployment level, not per-row.

create policy "anon insert notes"
  on notes for insert
  to anon
  with check (true);

create policy "anon update notes"
  on notes for update
  to anon
  using (true) with check (true);

create policy "anon delete notes"
  on notes for delete
  to anon
  using (true);
