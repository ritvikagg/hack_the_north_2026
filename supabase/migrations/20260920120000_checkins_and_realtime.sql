-- Party Pot follow-up: day check-ins + realtime standings.
--
-- ── refresh_member_status() ───────────────────────────────────────────
-- The ONLY client-reachable write path for party_members.status — the
-- table deliberately has no UPDATE policy, so this security definer
-- function performs the write after checking the row belongs to
-- auth.uid() and its party is still 'active'.
--
-- It also re-derives the status from party_day_records instead of
-- trusting a caller-supplied value, so a client cannot mark itself
-- 'completed' without the records to back it:
--   * any 'missed' record in the party window  -> 'failed'
--     (one miss forfeits the pledge, so failure lands immediately)
--   * all total_days resolved with no misses    -> 'completed'
--   * otherwise                                 -> stays 'active'
-- payout_amount and winner_id are untouched — those belong to the
-- privileged settle function added in a later change.
create or replace function public.refresh_member_status(p_member_id uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_member public.party_members%rowtype;
  v_party public.parties%rowtype;
  v_missed integer;
  v_resolved integer;
  v_status text;
begin
  select * into v_member
  from public.party_members
  where id = p_member_id;

  if not found or v_member.user_id <> auth.uid() then
    raise exception 'membership not found';
  end if;

  select * into v_party
  from public.parties
  where id = v_member.party_id;

  -- No-op once the member is already resolved or the party has left
  -- 'active' (settlement writes the terminal status itself).
  if v_member.status <> 'active' or v_party.status <> 'active' then
    return v_member.status;
  end if;

  select
    (count(*) filter (where r.status = 'missed'))::integer,
    (count(*) filter (where r.status <> 'pending'))::integer
  into v_missed, v_resolved
  from public.party_day_records r
  where r.party_member_id = p_member_id
    and r.date between v_party.start_date
                   and v_party.start_date + (v_party.total_days - 1);

  if v_missed > 0 then
    v_status := 'failed';
  elsif v_resolved >= v_party.total_days then
    v_status := 'completed';
  else
    v_status := 'active';
  end if;

  if v_status <> v_member.status then
    update public.party_members
    set status = v_status
    where id = p_member_id;
  end if;

  return v_status;
end;
$$;

revoke all on function public.refresh_member_status(uuid) from public;
grant execute on function public.refresh_member_status(uuid) to authenticated;

-- ── realtime ──────────────────────────────────────────────────────────
-- Live standings and the running pot need postgres_changes on both
-- tables. RLS applies to realtime subscriptions, so members only receive
-- rows they can already read.
alter publication supabase_realtime add table public.party_members;
alter publication supabase_realtime add table public.party_day_records;

-- DELETE events carry only the PK by default, which realtime cannot match
-- against a party_id subscription filter — a member leaving would go
-- unnoticed. FULL gives the filter the whole old row.
alter table public.party_members replica identity full;
alter table public.parties replica identity full;
