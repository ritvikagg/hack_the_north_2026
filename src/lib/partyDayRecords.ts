// ─────────────────────────────────────────────────────────────────
// Party Pot day check-ins.
//
// recordPartyDay upserts one party_day_records row for the CURRENT user.
// The caller passes a party_members id, but it is never trusted: the row
// is re-fetched and must belong to auth.uid(), and the day-record RLS
// policies independently require member_in_active_party().
//
// Member status transitions ('active' → 'completed'/'failed') go through
// the refresh_member_status RPC — party_members has no UPDATE policy, so
// that security definer function is the only write path, and it re-derives
// the status from the day records itself. payout_amount / winner are
// deliberately untouched here — that's the settlement step.
// ─────────────────────────────────────────────────────────────────
import { supabase } from './supabase';
import {
  requireUserId,
  type DayRecordStatus,
  type PartyDayRecord,
  type PartyMember,
  type PartyMemberStatus,
} from './parties';

export interface RecordPartyDayResult {
  record: PartyDayRecord;
  /** Member status after this check-in — 'active' until resolved. */
  memberStatus: PartyMemberStatus;
}

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Upserts the caller's party_day_records row for `date` (YYYY-MM-DD) and
 * returns the saved row plus the member's resulting status.
 *
 * Throws when the membership isn't the caller's own, the party or member
 * is no longer 'active', or `date` falls outside the party window
 * [start_date, start_date + total_days - 1].
 */
export async function recordPartyDay(
  partyMemberId: string,
  date: string,
  status: DayRecordStatus,
  actualSteps?: number,
): Promise<RecordPartyDayResult> {
  const userId = await requireUserId();

  if (
    actualSteps !== undefined &&
    (!Number.isInteger(actualSteps) || actualSteps < 0)
  ) {
    throw new Error('actualSteps must be a non-negative integer.');
  }

  const { data: member, error: memberError } = await supabase
    .from('party_members')
    .select('*')
    .eq('id', partyMemberId)
    .maybeSingle();
  if (memberError) throw memberError;
  if (!member || member.user_id !== userId) {
    throw new Error(
      'Membership not found — you can only check in for yourself.',
    );
  }
  if (member.status !== 'active') {
    throw new Error(`Your membership in this party is already ${member.status}.`);
  }

  const { data: party, error: partyError } = await supabase
    .from('parties')
    .select('id, status, start_date, total_days')
    .eq('id', (member as PartyMember).party_id)
    .single();
  if (partyError) throw partyError;
  if (party.status !== 'active') {
    throw new Error('This party is not active — check-ins are closed.');
  }

  const dateMs = Date.parse(`${date}T00:00:00Z`);
  const startMs = Date.parse(`${party.start_date}T00:00:00Z`);
  const endMs = startMs + (party.total_days - 1) * DAY_MS;
  if (Number.isNaN(dateMs) || dateMs < startMs || dateMs > endMs) {
    throw new Error("date is outside this party's active window.");
  }

  const { data: record, error: upsertError } = await supabase
    .from('party_day_records')
    .upsert(
      {
        party_member_id: partyMemberId,
        date,
        status,
        actual_steps: actualSteps ?? null,
        recorded_at: new Date().toISOString(),
      },
      { onConflict: 'party_member_id,date' },
    )
    .select()
    .single();
  if (upsertError) throw upsertError;

  // Resolve 'completed'/'failed' immediately when this check-in settles
  // the member's outcome. The RPC is the only permitted write path for
  // party_members.status and re-derives it from the records itself.
  const { data: memberStatus, error: rpcError } = await supabase.rpc(
    'refresh_member_status',
    { p_member_id: partyMemberId },
  );
  if (rpcError) throw rpcError;

  return {
    record: record as PartyDayRecord,
    memberStatus: memberStatus as PartyMemberStatus,
  };
}
