begin;

create extension if not exists pgtap with schema extensions;
select extensions.plan(13);

insert into auth.users (id, email)
values
  ('00000000-0000-0000-0000-000000000001', 'creator@example.test'),
  ('00000000-0000-0000-0000-000000000002', 'winner@example.test'),
  ('00000000-0000-0000-0000-000000000003', 'other@example.test'),
  ('00000000-0000-0000-0000-000000000004', 'failed@example.test');

create temporary table settlement_test_results (
  case_name text primary key,
  summary jsonb not null
);
grant select, insert on settlement_test_results to service_role;

select extensions.ok(
  not has_function_privilege(
    'anon',
    'public.settle_party(uuid, uuid, boolean)',
    'EXECUTE'
  )
  and not has_function_privilege(
    'authenticated',
    'public.settle_party(uuid, uuid, boolean)',
    'EXECUTE'
  ),
  'app-facing roles cannot execute the settlement RPC directly'
);

-- Winner math: $10 failed pledge, 10% house cut, winner receives $19.
insert into public.parties (
  id, name, creator_id, pledge_amount, total_days,
  daily_step_threshold, start_date, status, house_cut_bps
)
values (
  '10000000-0000-0000-0000-000000000001', 'Winner math',
  '00000000-0000-0000-0000-000000000001', 1000, 15,
  10000, current_date - 15, 'active', 1000
);

insert into public.party_members (id, party_id, user_id, joined_at)
values
  ('11000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', '2026-01-01T00:00:00Z'),
  ('11000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000002', '2026-01-02T00:00:00Z'),
  ('11000000-0000-0000-0000-000000000003', '10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000004', '2026-01-03T00:00:00Z');

insert into public.party_day_records (party_member_id, date, actual_steps)
select '11000000-0000-0000-0000-000000000001'::uuid, current_date - 15 + day_number, 11000
from generate_series(0, 14) as day_number
union all
select '11000000-0000-0000-0000-000000000002'::uuid, current_date - 15 + day_number, 12000
from generate_series(0, 14) as day_number
union all
select '11000000-0000-0000-0000-000000000003'::uuid, current_date - 15 + day_number,
  case when day_number = 14 then 9999 else 13000 end
from generate_series(0, 14) as day_number;

set local role service_role;
insert into settlement_test_results
select 'winner-math', public.settle_party(
  '10000000-0000-0000-0000-000000000001',
  '00000000-0000-0000-0000-000000000001',
  false
);
reset role;

select extensions.is(
  (select summary #>> '{winner,userId}' from settlement_test_results where case_name = 'winner-math'),
  '00000000-0000-0000-0000-000000000002',
  'highest-step completer wins'
);
select extensions.is(
  (select (summary ->> 'houseCutAmount')::integer from settlement_test_results where case_name = 'winner-math'),
  100,
  'house cut is calculated in basis points'
);
select extensions.is(
  (select payout_amount from public.party_members where id = '11000000-0000-0000-0000-000000000002'),
  1900,
  'winner receives own pledge plus forfeited pool minus house cut'
);
select extensions.is(
  (select payout_amount from public.party_members where id = '11000000-0000-0000-0000-000000000001'),
  1000,
  'other completer receives their own pledge'
);
select extensions.is(
  (select payout_amount from public.party_members where id = '11000000-0000-0000-0000-000000000003'),
  0,
  'failed member receives no payout'
);

-- Equal total steps: earliest joined_at wins.
insert into public.parties (
  id, name, creator_id, pledge_amount, total_days,
  daily_step_threshold, start_date, status, house_cut_bps
)
values (
  '20000000-0000-0000-0000-000000000001', 'Tiebreak',
  '00000000-0000-0000-0000-000000000001', 500, 15,
  10000, current_date, 'active', 1000
);

insert into public.party_members (id, party_id, user_id, joined_at)
values
  ('21000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000002', '2026-01-02T00:00:00Z'),
  ('21000000-0000-0000-0000-000000000002', '20000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000003', '2026-01-01T00:00:00Z');

insert into public.party_day_records (party_member_id, date, actual_steps)
select member_id, current_date + day_number, 10000
from (
  values
    ('21000000-0000-0000-0000-000000000001'::uuid),
    ('21000000-0000-0000-0000-000000000002'::uuid)
) as members(member_id)
cross join generate_series(0, 14) as day_number;

set local role service_role;
insert into settlement_test_results
select 'tiebreak', public.settle_party(
  '20000000-0000-0000-0000-000000000001',
  '00000000-0000-0000-0000-000000000001',
  true
);
reset role;

select extensions.is(
  (select summary #>> '{winner,userId}' from settlement_test_results where case_name = 'tiebreak'),
  '00000000-0000-0000-0000-000000000003',
  'earliest joined_at wins an equal-steps tiebreak'
);
select extensions.is(
  (select (summary ->> 'houseCutAmount')::integer from settlement_test_results where case_name = 'tiebreak'),
  0,
  'no forfeitures means no house cut'
);

-- Zero completers: everybody gets a full refund and there is no winner/cut.
insert into public.parties (
  id, name, creator_id, pledge_amount, total_days,
  daily_step_threshold, start_date, status, house_cut_bps
)
values (
  '30000000-0000-0000-0000-000000000001', 'Refund fallback',
  '00000000-0000-0000-0000-000000000001', 800, 15,
  10000, current_date, 'active', 1000
);

insert into public.party_members (id, party_id, user_id, joined_at)
values
  ('31000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000002', '2026-01-01T00:00:00Z'),
  ('31000000-0000-0000-0000-000000000002', '30000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000003', '2026-01-02T00:00:00Z');

set local role service_role;
insert into settlement_test_results
select 'zero-completers', public.settle_party(
  '30000000-0000-0000-0000-000000000001',
  '00000000-0000-0000-0000-000000000001',
  true
);
reset role;

select extensions.is(
  (select summary ->> 'winner' from settlement_test_results where case_name = 'zero-completers'),
  null,
  'zero completers produces no winner'
);
select extensions.is(
  (select (summary ->> 'houseCutAmount')::integer from settlement_test_results where case_name = 'zero-completers'),
  0,
  'zero completers produces no house cut'
);
select extensions.is(
  (select sum(payout_amount) from public.party_members where party_id = '30000000-0000-0000-0000-000000000001'),
  1600::bigint,
  'zero completers refunds every pledge in full'
);
select extensions.is(
  (select count(*) from public.party_members where party_id = '30000000-0000-0000-0000-000000000001' and payout_amount <> 800),
  0::bigint,
  'each zero-completer fallback payout equals the member pledge'
);

-- A second attempt reaches the row-locked status guard and changes nothing.
set local role service_role;
select extensions.throws_ok(
  $$select public.settle_party(
    '10000000-0000-0000-0000-000000000001',
    '00000000-0000-0000-0000-000000000001',
    true
  )$$,
  'P0001',
  'Party has already been settled.',
  'already-settled party cannot be settled twice'
);
reset role;

select * from extensions.finish();
rollback;
