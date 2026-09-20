-- Party Pot settlement engine.
--
-- The Edge Function is only an authenticated transport. Every decision and
-- write that affects money happens in this single PostgreSQL transaction.
-- PostgreSQL functions execute atomically, and the FOR UPDATE lock below
-- serializes concurrent attempts for the same party.

create or replace function public.settle_party(
  p_party_id uuid,
  p_requested_by uuid,
  p_force boolean default false
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_party public.parties%rowtype;
  v_completed_count integer;
  v_failed_count integer;
  v_forfeited_pool bigint;
  v_house_cut bigint := 0;
  v_winner_member_id uuid;
  v_winner_user_id uuid;
  v_winner_total_steps bigint;
  v_settled_at timestamptz;
  v_payouts jsonb;
begin
  -- This lock is the concurrency boundary. A second caller waits here, then
  -- sees the committed 'settled' status and fails without changing payouts.
  select *
  into v_party
  from public.parties
  where id = p_party_id
  for update;

  if not found then
    raise exception using
      errcode = 'P0002',
      message = 'Party not found.';
  end if;

  if v_party.status = 'settled' then
    raise exception using
      errcode = 'P0001',
      message = 'Party has already been settled.';
  end if;

  if v_party.status <> 'active' then
    raise exception using
      errcode = 'P0001',
      message = 'Only an active party can be settled.';
  end if;

  -- Manual demo settlement is intentionally limited to the party creator.
  -- The caller identity is verified by the Edge Function before this RPC.
  if p_requested_by is null or p_requested_by <> v_party.creator_id then
    raise exception using
      errcode = '42501',
      message = 'Only the party creator can settle this party.';
  end if;

  if not p_force
     and current_date < v_party.start_date + v_party.total_days then
    raise exception using
      errcode = 'P0001',
      message = 'Party challenge period has not ended.';
  end if;

  -- Recompute completion from actual steps, never the user-asserted record
  -- status. A completer needs exactly one qualifying record for every date in
  -- [start_date, start_date + total_days); the table's unique constraint
  -- guarantees at most one record per member/date.
  update public.party_members as pm
  set status = case
    when (
      select count(*) = v_party.total_days
         and count(*) filter (
           where pdr.actual_steps >= v_party.daily_step_threshold
         ) = v_party.total_days
      from public.party_day_records as pdr
      where pdr.party_member_id = pm.id
        and pdr.date >= v_party.start_date
        and pdr.date < v_party.start_date + v_party.total_days
    ) then 'completed'
    else 'failed'
  end
  where pm.party_id = p_party_id;

  select
    count(*) filter (where status = 'completed'),
    count(*) filter (where status = 'failed')
  into v_completed_count, v_failed_count
  from public.party_members
  where party_id = p_party_id;

  v_forfeited_pool := v_failed_count::bigint * v_party.pledge_amount::bigint;

  if v_completed_count = 0 then
    -- Nobody completed: refund every member, including members now marked
    -- failed, and do not take a house cut.
    update public.party_members
    set payout_amount = v_party.pledge_amount
    where party_id = p_party_id;
  else
    select
      pm.id,
      pm.user_id,
      coalesce(sum(pdr.actual_steps), 0)::bigint
    into
      v_winner_member_id,
      v_winner_user_id,
      v_winner_total_steps
    from public.party_members as pm
    left join public.party_day_records as pdr
      on pdr.party_member_id = pm.id
     and pdr.date >= v_party.start_date
     and pdr.date < v_party.start_date + v_party.total_days
    where pm.party_id = p_party_id
      and pm.status = 'completed'
    group by pm.id, pm.user_id, pm.joined_at
    order by
      coalesce(sum(pdr.actual_steps), 0) desc,
      pm.joined_at asc,
      pm.id asc
    limit 1;

    -- Monetary columns are integer cents. floor gives a deterministic rule
    -- when basis-point multiplication produces a fractional cent.
    v_house_cut := floor(
      v_forfeited_pool::numeric * v_party.house_cut_bps::numeric / 10000
    )::bigint;

    update public.party_members as pm
    set payout_amount = case
      when pm.status = 'failed' then 0
      when pm.id = v_winner_member_id then
        (v_party.pledge_amount::bigint + v_forfeited_pool - v_house_cut)::integer
      else v_party.pledge_amount
    end
    where pm.party_id = p_party_id;
  end if;

  update public.parties
  set
    winner_id = v_winner_user_id,
    status = 'settled',
    settled_at = now()
  where id = p_party_id
  returning settled_at into v_settled_at;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'memberId', pm.id,
        'userId', pm.user_id,
        'status', pm.status,
        'totalSteps', coalesce(steps.total_steps, 0),
        'payoutAmount', pm.payout_amount
      )
      order by pm.joined_at, pm.id
    ),
    '[]'::jsonb
  )
  into v_payouts
  from public.party_members as pm
  left join lateral (
    select coalesce(sum(pdr.actual_steps), 0)::bigint as total_steps
    from public.party_day_records as pdr
    where pdr.party_member_id = pm.id
      and pdr.date >= v_party.start_date
      and pdr.date < v_party.start_date + v_party.total_days
  ) as steps on true
  where pm.party_id = p_party_id;

  return jsonb_build_object(
    'partyId', p_party_id,
    'settledAt', v_settled_at,
    'winner', case
      when v_winner_user_id is null then null
      else jsonb_build_object(
        'memberId', v_winner_member_id,
        'userId', v_winner_user_id,
        'totalSteps', v_winner_total_steps
      )
    end,
    'forfeitedPool', v_forfeited_pool,
    'houseCutAmount', v_house_cut,
    'payouts', v_payouts
  );
end;
$$;

-- Functions are executable by PUBLIC by default. Keep this RPC callable only
-- by the service-role client inside the Edge Function, never by app clients.
revoke all on function public.settle_party(uuid, uuid, boolean) from public;
revoke all on function public.settle_party(uuid, uuid, boolean) from anon;
revoke all on function public.settle_party(uuid, uuid, boolean) from authenticated;
grant execute on function public.settle_party(uuid, uuid, boolean) to service_role;
