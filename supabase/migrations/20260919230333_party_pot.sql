-- Party Pot: group pledge challenge schema + RLS.
-- Business rules (enforced later by a privileged settle function):
--   * Everyone pledges the same amount and must hit the daily step goal
--     every day of total_days (15-30, same range as the solo challenge).
--   * Missing even one day forfeits that member's ENTIRE pledge into the pool.
--   * A single winner (highest total steps among full-completers, tiebreak by
--     earliest joined_at) takes the forfeited pool minus the house cut.
--   * If nobody completes all days, no house cut and every pledge is refunded.

-- ── profiles ────────────────────────────────────────────────────────────────

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text not null,
  created_at timestamptz not null default now()
);

-- Auto-create a profile row on signup (standard Supabase pattern).
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'display_name', 'Walker'))
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ── parties ─────────────────────────────────────────────────────────────────

create table public.parties (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  creator_id uuid not null references auth.users (id) on delete cascade,
  pledge_amount integer not null check (pledge_amount > 0), -- integer cents
  total_days integer not null check (total_days between 15 and 30),
  daily_step_threshold integer not null check (daily_step_threshold > 0),
  start_date date not null,
  status text not null default 'open'
    check (status in ('open', 'active', 'settled', 'cancelled')),
  house_cut_bps integer not null default 1000 check (house_cut_bps between 0 and 10000),
  winner_id uuid references auth.users (id),
  settled_at timestamptz,
  created_at timestamptz not null default now()
);

create index parties_status_idx on public.parties (status);
create index parties_creator_id_idx on public.parties (creator_id);

-- ── party_members ───────────────────────────────────────────────────────────

create table public.party_members (
  id uuid primary key default gen_random_uuid(),
  party_id uuid not null references public.parties (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  status text not null default 'active'
    check (status in ('active', 'completed', 'failed')),
  payout_amount integer check (payout_amount >= 0), -- integer cents
  joined_at timestamptz not null default now(),
  unique (party_id, user_id)
);

create index party_members_party_id_idx on public.party_members (party_id);
create index party_members_user_id_idx on public.party_members (user_id);

-- ── party_day_records ───────────────────────────────────────────────────────

create table public.party_day_records (
  id uuid primary key default gen_random_uuid(),
  party_member_id uuid not null references public.party_members (id) on delete cascade,
  date date not null,
  status text not null default 'pending'
    check (status in ('pending', 'hit', 'missed')),
  actual_steps integer check (actual_steps >= 0),
  recorded_at timestamptz,
  unique (party_member_id, date)
);

create index party_day_records_member_idx on public.party_day_records (party_member_id);

-- ── RLS helper functions ────────────────────────────────────────────────────
-- security definer so the checks bypass RLS on the underlying tables. This is
-- required: policies on party_members cannot query party_members directly
-- (infinite recursion), and policy subqueries should not depend on the
-- caller's visibility through other tables' policies.
-- auth.uid() reads the request JWT, so it still resolves to the calling user
-- inside a security definer function. search_path is pinned to '' to prevent
-- schema-hijacking of unqualified names; everything is fully qualified.

create or replace function public.is_party_member(p_party_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.party_members
    where party_id = p_party_id and user_id = auth.uid()
  );
$$;

create or replace function public.party_is_open(p_party_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.parties
    where id = p_party_id and status = 'open'
  );
$$;

-- True when the party_members row belongs to auth.uid() AND its party is
-- currently 'active'. Used for day-record INSERT/UPDATE checks.
create or replace function public.member_in_active_party(p_member_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.party_members pm
    join public.parties p on p.id = pm.party_id
    where pm.id = p_member_id
      and pm.user_id = auth.uid()
      and p.status = 'active'
  );
$$;

-- True when the party_members row is in a party the caller belongs to.
-- Used for day-record SELECT (members can see everyone's daily standings).
create or replace function public.member_row_in_my_party(p_member_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.party_members target
    where target.id = p_member_id
      and public.is_party_member(target.party_id)
  );
$$;

revoke all on function public.is_party_member(uuid) from public;
revoke all on function public.party_is_open(uuid) from public;
revoke all on function public.member_in_active_party(uuid) from public;
revoke all on function public.member_row_in_my_party(uuid) from public;
grant execute on function public.is_party_member(uuid) to authenticated;
grant execute on function public.party_is_open(uuid) to authenticated;
grant execute on function public.member_in_active_party(uuid) to authenticated;
grant execute on function public.member_row_in_my_party(uuid) to authenticated;

-- ── RLS policies ────────────────────────────────────────────────────────────

alter table public.profiles enable row level security;
alter table public.parties enable row level security;
alter table public.party_members enable row level security;
alter table public.party_day_records enable row level security;

-- profiles: display_name is needed to render member lists/standings, so any
-- authenticated user may read profiles. Users may only write their own row.
create policy profiles_select on public.profiles
  for select to authenticated using (true);

create policy profiles_insert on public.profiles
  for insert to authenticated with check (id = auth.uid());

create policy profiles_update on public.profiles
  for update to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

-- parties: browseable while 'open'; after that only creator/members can see it.
create policy parties_select on public.parties
  for select to authenticated
  using (
    status = 'open'
    or creator_id = auth.uid()
    or public.is_party_member(id)
  );

-- Anyone can create a party they own. Forbid creating rows that are already
-- past 'open' or carry settlement fields.
create policy parties_insert on public.parties
  for insert to authenticated
  with check (
    creator_id = auth.uid()
    and status = 'open'
    and winner_id is null
    and settled_at is null
  );

-- No UPDATE/DELETE for authenticated users: status transitions, winner_id,
-- settled_at and house_cut_bps are only ever written by the privileged
-- settle/cancel functions (security definer) added later.

-- party_members: readable only by members of the same party.
create policy party_members_select on public.party_members
  for select to authenticated
  using (public.is_party_member(party_id));

-- A user may join only themselves, only while the party is 'open', and cannot
-- self-assign a terminal status or a payout.
create policy party_members_insert on public.party_members
  for insert to authenticated
  with check (
    user_id = auth.uid()
    and status = 'active'
    and payout_amount is null
    and public.party_is_open(party_id)
  );

-- No UPDATE/DELETE for authenticated users: status and payout_amount are
-- settlement outputs and must only be written by the privileged function.

-- party_day_records: any member can read every record in their party
-- (needed for standings); users can only write their own rows, and only
-- while the party is 'active'.
create policy day_records_select on public.party_day_records
  for select to authenticated
  using (public.member_row_in_my_party(party_member_id));

create policy day_records_insert on public.party_day_records
  for insert to authenticated
  with check (public.member_in_active_party(party_member_id));

create policy day_records_update on public.party_day_records
  for update to authenticated
  using (public.member_in_active_party(party_member_id))
  with check (public.member_in_active_party(party_member_id));
