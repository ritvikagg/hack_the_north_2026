# Supabase — Party Pot schema & RLS

Migrations live in `supabase/migrations/`. Apply with `supabase db push` against
the linked project.

## Business rules

- Multiple users join a **party**, each pledging the same fixed amount
  (`pledge_amount`, integer cents), committing to a shared daily step goal
  (`daily_step_threshold`) for `total_days` days (15–30, same range as the solo
  challenge engine in `src/store/challengeEngine.ts`).
- At the end, anyone who missed even one day forfeits their **entire** pledge
  into a pool.
- A single winner — highest total steps among members who hit every day,
  tiebreak by earliest `joined_at` — takes the whole forfeited pool minus the
  house cut (`house_cut_bps`, default 1000 = 10%).
- If nobody completes all days, no house cut is taken and everyone gets their
  own pledge back.

Settlement (winner selection, status transitions, payout writes) is performed
by privileged `security definer` functions added in a later change — never by
client writes.

## Tables

| Table | Purpose |
| --- | --- |
| `profiles` | `id` → `auth.users`, `display_name`, `created_at`. Auto-created by the `on_auth_user_created` trigger. |
| `parties` | `name`, `creator_id`, `pledge_amount` (cents), `total_days` (CHECK 15–30), `daily_step_threshold`, `start_date`, `status` (`open`/`active`/`settled`/`cancelled`), `house_cut_bps` (default 1000, CHECK 0–10000), `winner_id`, `settled_at`, `created_at`. |
| `party_members` | `party_id`, `user_id`, `status` (`active`/`completed`/`failed`, default `active`), `payout_amount` (cents, nullable), `joined_at`. UNIQUE `(party_id, user_id)`. |
| `party_day_records` | `party_member_id`, `date`, `status` (`pending`/`hit`/`missed`, default `pending`), `actual_steps`, `recorded_at`. UNIQUE `(party_member_id, date)`. |

## RLS policy set

RLS is enabled on all four tables. Because this feature involves pledged
money, the default posture is **deny**: anything not explicitly listed below
is forbidden for client (`authenticated`) roles.

### Helper functions (`security definer`, `set search_path = ''`)

Policies on `party_members` cannot query `party_members` directly — Postgres
raises infinite recursion. These helpers evaluate membership/ownership while
bypassing RLS. `auth.uid()` still resolves to the calling user's JWT inside
them, and `search_path` is pinned to `''` (all names fully qualified) so they
can't be hijacked via schema shadowing. EXECUTE is revoked from `public`/`anon`
and granted only to `authenticated`.

| Function | Returns true when… |
| --- | --- |
| `is_party_member(party_id)` | caller has a `party_members` row in that party |
| `party_is_open(party_id)` | the party's status is `'open'` |
| `member_in_active_party(member_id)` | the member row belongs to the caller **and** its party is `'active'` |
| `member_row_in_my_party(member_id)` | the member row's party is one the caller belongs to |

### Write-path functions (`security definer`)

| Function | Purpose |
| --- | --- |
| `refresh_member_status(member_id)` → `text` | The only client-reachable write to `party_members.status`. Verifies the row belongs to `auth.uid()` and its party is `'active'`, then **re-derives** the status from `party_day_records` (any `missed` → `failed`; all `total_days` resolved with none missed → `completed`; else stays `active`). Callers cannot self-assign a status. `payout_amount`/`winner_id` are never touched — those belong to the settle function. |

### `profiles`

| Policy | Operation | Rule | Why |
| --- | --- | --- | --- |
| `profiles_select` | SELECT | any authenticated user | `display_name` is needed to render member lists and standings; not sensitive. |
| `profiles_insert` | INSERT | `id = auth.uid()` | users can only create their own profile. |
| `profiles_update` | UPDATE | `id = auth.uid()` (USING + WITH CHECK) | users can only edit their own profile. |

### `parties`

| Policy | Operation | Rule | Why |
| --- | --- | --- | --- |
| `parties_select` | SELECT | `status = 'open'` OR creator OR member | open parties must be browseable so users can find/join them; once a party leaves `open`, its pledged stakes make member-only visibility the safe default. |
| `parties_insert` | INSERT | `creator_id = auth.uid()` AND `status = 'open'` AND `winner_id IS NULL` AND `settled_at IS NULL` | anyone can create a party they own, but cannot create one pre-settled or pre-activated. |
| — | UPDATE / DELETE | *(no policy → denied)* | `status`, `winner_id`, `settled_at`, and `house_cut_bps` are settlement-sensitive; only privileged functions may change them. Even cancellation goes through a function so refunds can be handled atomically. |

### `party_members`

| Policy | Operation | Rule | Why |
| --- | --- | --- | --- |
| `party_members_select` | SELECT | `is_party_member(party_id)` | only members can see a party's roster — pledges and standings are not public. |
| `party_members_insert` | INSERT | `user_id = auth.uid()` AND `status = 'active'` AND `payout_amount IS NULL` AND `party_is_open(party_id)` | a user can join only themselves and only while the party is open; they cannot self-assign `completed` or a payout at join time. |
| `party_members_delete_open` | DELETE | `user_id = auth.uid()` AND `party_is_open(party_id)` | a user may leave by deleting their own row while the party is still open; once it starts, the row is settlement state. |
| — | UPDATE | *(no policy → denied)* | `status` and `payout_amount` are settlement outputs and must **never** be user-writable. There is intentionally no UPDATE policy; the only write path is `refresh_member_status()` above, which derives the status itself. |

### Views

| View | Purpose |
| --- | --- |
| `open_parties` | `parties` rows where `status = 'open'` plus `member_count`. Owner-evaluated (bypasses RLS) so non-members can see roster sizes on the browse screen — rosters themselves stay member-only. SELECT granted to `authenticated`. |

### `party_day_records`

| Policy | Operation | Rule | Why |
| --- | --- | --- | --- |
| `day_records_select` | SELECT | `member_row_in_my_party(party_member_id)` | members can read everyone's daily records in their party (needed for standings); non-members see nothing. |
| `day_records_insert` | INSERT | `member_in_active_party(party_member_id)` | a user can create day records only for their own membership row and only while the party is `'active'`. |
| `day_records_update` | UPDATE | same for USING and WITH CHECK | users may correct their own in-progress records, but cannot edit another member's row or keep editing after settlement/closure. |
| — | DELETE | *(no policy → denied)* | records are audit history for settlement; deletion is never allowed from the client. |

## Realtime

`party_members` and `party_day_records` are in the `supabase_realtime`
publication so `usePartyRealtime` (`src/lib/usePartyRealtime.ts`) can stream
live standings. RLS applies to realtime subscriptions — members only receive
rows they can already read. `party_members` and `parties` use
`REPLICA IDENTITY FULL` so DELETE events still match `party_id`/`id`
subscription filters.

## Caveats for the settlement function (later change)

- `party_day_records.status` is **user-asserted**. The settle function should
  recompute hit/missed from `actual_steps >= parties.daily_step_threshold`
  rather than trusting the stored status.
- The settle function must run as `security definer` (owner role bypasses RLS)
  and should be idempotent (guard on `parties.status = 'active'` → `'settled'`
  in a single transaction).
- `joined_at` is the tiebreak field for winner selection; `house_cut_bps`
  applies only when at least one member completed all days.
