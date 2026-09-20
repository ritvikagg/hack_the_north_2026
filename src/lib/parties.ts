// ─────────────────────────────────────────────────────────────────
// Party Pot client API.
//
// Everything here runs as the normal authenticated user — authorization
// is the RLS policies in supabase/migrations. RLS often *silently*
// denies (0 rows, not an error), so these functions pre-check and throw
// clear Errors rather than letting callers misread an empty result.
// ─────────────────────────────────────────────────────────────────
import { supabase } from './supabase';

export type PartyStatus = 'open' | 'active' | 'settled' | 'cancelled';
export type PartyMemberStatus = 'active' | 'completed' | 'failed';
export type DayRecordStatus = 'pending' | 'hit' | 'missed';

export interface Party {
  id: string;
  name: string;
  creator_id: string;
  pledge_amount: number; // integer cents
  total_days: number; // 15–30
  daily_step_threshold: number;
  start_date: string; // YYYY-MM-DD
  status: PartyStatus;
  house_cut_bps: number;
  winner_id: string | null;
  settled_at: string | null;
  created_at: string;
}

export interface PartyMember {
  id: string;
  party_id: string;
  user_id: string;
  status: PartyMemberStatus;
  payout_amount: number | null; // integer cents, settlement output
  joined_at: string;
}

export interface PartyMemberWithProfile extends PartyMember {
  display_name: string | null;
}

export interface PartyDayRecord {
  id: string;
  party_member_id: string;
  date: string; // YYYY-MM-DD
  status: DayRecordStatus;
  actual_steps: number | null;
  recorded_at: string | null;
}

/** Row of the open_parties view: an 'open' party plus its roster size. */
export interface OpenParty extends Party {
  member_count: number;
}

export interface PartyDetails {
  party: Party;
  /** Empty unless the caller is a member — rosters are member-only under RLS. */
  members: PartyMemberWithProfile[];
  myMembership: PartyMember | null;
  myDayRecords: PartyDayRecord[];
}

export async function requireUserId(): Promise<string> {
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) {
    throw new Error('You must be signed in to do that.');
  }
  return data.user.id;
}

/** null when the party doesn't exist OR RLS hides it from the caller. */
async function getPartyRow(
  partyId: string,
): Promise<Pick<Party, 'id' | 'status'> | null> {
  const { data, error } = await supabase
    .from('parties')
    .select('id, status')
    .eq('id', partyId)
    .maybeSingle();
  if (error) throw error;
  return data;
}

/** null when the caller isn't a member (non-members can't read the roster). */
async function getMyMembership(
  partyId: string,
  userId: string,
): Promise<PartyMember | null> {
  const { data, error } = await supabase
    .from('party_members')
    .select('*')
    .eq('party_id', partyId)
    .eq('user_id', userId)
    .maybeSingle();
  if (error) throw error;
  return data;
}

/**
 * Creates an 'open' party owned by the current user, who is automatically
 * added as the first member.
 *
 * Not transactional (two inserts under user permissions): if the member
 * insert fails the party stays 'open' with no members — harmless, it just
 * sits in the browse list until it goes stale.
 */
export async function createParty(
  name: string,
  pledgeAmount: number,
  totalDays: number,
  dailyStepThreshold: number,
  startDate: string,
): Promise<Party> {
  const userId = await requireUserId();

  if (totalDays < 15 || totalDays > 30) {
    throw new Error('totalDays must be between 15 and 30.');
  }
  if (pledgeAmount <= 0) {
    throw new Error('pledgeAmount must be a positive number of cents.');
  }
  if (dailyStepThreshold <= 0) {
    throw new Error('dailyStepThreshold must be positive.');
  }

  const { data: party, error } = await supabase
    .from('parties')
    .insert({
      name,
      creator_id: userId,
      pledge_amount: pledgeAmount,
      total_days: totalDays,
      daily_step_threshold: dailyStepThreshold,
      start_date: startDate,
      status: 'open',
    })
    .select()
    .single();
  if (error) throw error;

  const { error: memberError } = await supabase
    .from('party_members')
    .insert({ party_id: party.id, user_id: userId });
  if (memberError) throw memberError;

  return party as Party;
}

/**
 * Adds the current user to an 'open' party.
 * Throws if the party isn't visible/joinable, has already started, or the
 * user is already a member.
 */
export async function joinParty(partyId: string): Promise<PartyMember> {
  const userId = await requireUserId();

  const party = await getPartyRow(partyId);
  if (!party) {
    throw new Error('Party not found or no longer joinable.');
  }
  if (await getMyMembership(partyId, userId)) {
    throw new Error('You have already joined this party.');
  }
  if (party.status !== 'open') {
    throw new Error('This party has already started — joining is closed.');
  }

  const { data: member, error } = await supabase
    .from('party_members')
    .insert({ party_id: partyId, user_id: userId })
    .select()
    .single();
  if (error) {
    // Race-safe duplicates of the pre-checks above.
    if (error.code === '23505') {
      throw new Error('You have already joined this party.');
    }
    if (error.code === '42501') {
      throw new Error('This party is no longer open.');
    }
    throw error;
  }
  return member as PartyMember;
}

/** Open parties for the browse/join screen, including roster size. */
export async function listOpenParties(): Promise<OpenParty[]> {
  // member_count comes from the open_parties view — an embedded
  // party_members count would read 0 for non-members under RLS.
  const { data, error } = await supabase
    .from('open_parties')
    .select('*')
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []) as OpenParty[];
}

/**
 * Party + roster (with display_name) + the caller's own membership and day
 * records. Non-members can call this for an 'open' party but get an empty
 * members list — rosters are member-only under RLS.
 */
export async function getPartyDetails(partyId: string): Promise<PartyDetails> {
  const userId = await requireUserId();

  const { data: party, error } = await supabase
    .from('parties')
    .select('*')
    .eq('id', partyId)
    .maybeSingle();
  if (error) throw error;
  if (!party) throw new Error('Party not found or not visible to you.');

  const { data: memberRows, error: membersError } = await supabase
    .from('party_members')
    .select('*')
    .eq('party_id', partyId)
    .order('joined_at', { ascending: true });
  if (membersError) throw membersError;

  const rows = (memberRows ?? []) as PartyMember[];

  // profiles has no FK to party_members (both point at auth.users), so
  // PostgREST can't embed it — join display_name with a second query.
  const { data: profiles, error: profilesError } = rows.length
    ? await supabase
        .from('profiles')
        .select('id, display_name')
        .in('id', rows.map(m => m.user_id))
    : { data: [], error: null };
  if (profilesError) throw profilesError;

  const nameById = new Map(
    (profiles ?? []).map(p => [p.id, p.display_name] as const),
  );
  const members = rows.map(m => ({
    ...m,
    display_name: nameById.get(m.user_id) ?? null,
  }));

  const myMembership = rows.find(m => m.user_id === userId) ?? null;
  let myDayRecords: PartyDayRecord[] = [];
  if (myMembership) {
    const { data: dayRecords, error: dayError } = await supabase
      .from('party_day_records')
      .select('*')
      .eq('party_member_id', myMembership.id)
      .order('date', { ascending: true });
    if (dayError) throw dayError;
    myDayRecords = (dayRecords ?? []) as PartyDayRecord[];
  }

  return { party: party as Party, members, myMembership, myDayRecords };
}

/**
 * Removes the caller's own membership row. Only allowed while the party is
 * still 'open' — after that the row is settlement state and immutable.
 */
export async function leaveParty(partyId: string): Promise<void> {
  const userId = await requireUserId();

  const party = await getPartyRow(partyId);
  if (!party) throw new Error('Party not found or not visible to you.');
  if (party.status !== 'open') {
    throw new Error('You can only leave a party while it is still open.');
  }

  const membership = await getMyMembership(partyId, userId);
  if (!membership) throw new Error('You are not a member of this party.');

  const { error, count } = await supabase
    .from('party_members')
    .delete({ count: 'exact' })
    .eq('id', membership.id);
  if (error) throw error;
  if (count === 0) {
    // RLS denied it silently — the party must have left 'open' in the meantime.
    throw new Error('Could not leave — the party may have already started.');
  }
}
