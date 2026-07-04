-- The auth security scan found notes' SELECT policy scoped to the
-- Postgres "public" pseudo-role (all roles, including authenticated),
-- while every other table's read policy is scoped specifically to
-- "anon". Not exploitable today (no per-user data exists yet), but an
-- inconsistency worth removing before it becomes one.
drop policy "Notes are viewable by everyone" on notes;
create policy "anon select notes" on notes for select to anon using (true);
