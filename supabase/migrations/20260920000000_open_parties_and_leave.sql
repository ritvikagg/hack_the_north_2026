-- Party Pot follow-up: browse support + leaving open parties.

-- ── open_parties view ───────────────────────────────────────────────────────
-- Member rosters are member-only under RLS (party_members_select), so a
-- client cannot count members of a party it hasn't joined — an embedded
-- party_members count would read 0 on the browse screen. This view is owned
-- by the migration role (bypasses RLS) and exposes only 'open' parties, which
-- parties_select already makes publicly browseable, plus member_count.
create view public.open_parties as
select
  p.*,
  (
    select count(*)::integer
    from public.party_members pm
    where pm.party_id = p.id
  ) as member_count
from public.parties p
where p.status = 'open';

grant select on public.open_parties to authenticated;

-- ── leave policy ────────────────────────────────────────────────────────────
-- Leaving is deleting your own membership row, allowed only while the party
-- is 'open'. Once the party starts, the row becomes settlement state and
-- stays immutable (still no client UPDATE/DELETE path to it).
create policy party_members_delete_open on public.party_members
  for delete to authenticated
  using (user_id = auth.uid() and public.party_is_open(party_id));
