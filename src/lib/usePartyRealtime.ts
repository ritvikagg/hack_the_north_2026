// ─────────────────────────────────────────────────────────────────
// Live party standings via Supabase Realtime (postgres_changes) — no
// polling. State is fetched once when the channel subscribes, then
// INSERT/UPDATE/DELETE events patch it in place.
//
// Notes:
//   * party_day_records has no party_id column, so its subscription is
//     unfiltered and events are matched client-side against the live
//     member-id set (RLS already limits delivery to parties the caller
//     belongs to).
//   * Requires migration 20260920120000: both tables in the
//     supabase_realtime publication, REPLICA IDENTITY FULL so DELETE
//     events still match subscription filters.
//
// Usage:
//   function PartyScreen({ partyId }: { partyId: string }) {
//     const { members, dayRecordsByMember, potTotal, connected } =
//       usePartyRealtime(partyId);
//     // members[i].status      -> live 'active' | 'completed' | 'failed'
//     // members[i].display_name -> joined from profiles
//     // dayRecordsByMember[id] -> that member's live hit/miss rows
//     // potTotal               -> forfeited pool in cents
//     //   (failed members × pledge_amount)
//   }
// ─────────────────────────────────────────────────────────────────
import { useEffect, useMemo, useState } from 'react';
import { supabase } from './supabase';
import type {
  Party,
  PartyDayRecord,
  PartyMember,
  PartyMemberWithProfile,
} from './parties';

export interface PartyRealtimeState {
  party: Party | null;
  /** Live roster ordered by joined_at, display_name joined in. */
  members: PartyMemberWithProfile[];
  /** member_id → day records ordered by date. */
  dayRecordsByMember: Record<string, PartyDayRecord[]>;
  memberCount: number;
  failedCount: number;
  completedCount: number;
  /** Forfeited pledges so far (failed members × pledge_amount), cents. */
  potTotal: number;
  /** True once the realtime channel reports SUBSCRIBED. */
  connected: boolean;
  /** First load/channel error message, if any. */
  error: string | null;
}

export function usePartyRealtime(partyId: string | null): PartyRealtimeState {
  const [party, setParty] = useState<Party | null>(null);
  const [memberMap, setMemberMap] = useState<Record<string, PartyMember>>({});
  const [recordMap, setRecordMap] = useState<Record<string, PartyDayRecord>>(
    {},
  );
  const [names, setNames] = useState<Record<string, string | null>>({});
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setParty(null);
    setMemberMap({});
    setRecordMap({});
    setNames({});
    setConnected(false);
    setError(null);
    if (!partyId) return;

    let cancelled = false;
    // Member ids for this party — also the client-side filter for
    // day-record events, which carry no party_id of their own.
    const memberIds = new Set<string>();
    const requestedNames = new Set<string>();

    const fetchNames = async (userIds: string[]) => {
      const missing = userIds.filter(id => !requestedNames.has(id));
      if (!missing.length) return;
      missing.forEach(id => requestedNames.add(id));
      const { data, error: err } = await supabase
        .from('profiles')
        .select('id, display_name')
        .in('id', missing);
      if (err || cancelled) return;
      setNames(prev => {
        const next = { ...prev };
        for (const p of data ?? []) next[p.id] = p.display_name;
        return next;
      });
    };

    const applyMember = (m: PartyMember) => {
      memberIds.add(m.id);
      setMemberMap(prev => ({ ...prev, [m.id]: m }));
      void fetchNames([m.user_id]);
    };

    const removeMember = (m: { id?: string }) => {
      if (!m.id) return;
      memberIds.delete(m.id);
      setMemberMap(prev => {
        const next = { ...prev };
        delete next[m.id!];
        return next;
      });
      setRecordMap(prev => {
        const next: Record<string, PartyDayRecord> = {};
        for (const [id, r] of Object.entries(prev)) {
          if (r.party_member_id !== m.id) next[id] = r;
        }
        return next;
      });
    };

    const applyRecord = (r: PartyDayRecord) => {
      if (!memberIds.has(r.party_member_id)) return; // another party's row
      setRecordMap(prev => ({ ...prev, [r.id]: r }));
    };

    const removeRecord = (r: { id?: string }) => {
      if (!r.id) return;
      setRecordMap(prev => {
        const next = { ...prev };
        delete next[r.id!];
        return next;
      });
    };

    const load = async () => {
      const [partyRes, membersRes] = await Promise.all([
        supabase.from('parties').select('*').eq('id', partyId).maybeSingle(),
        supabase
          .from('party_members')
          .select('*')
          .eq('party_id', partyId)
          .order('joined_at', { ascending: true }),
      ]);
      const firstError = partyRes.error ?? membersRes.error;
      if (firstError) {
        if (!cancelled) setError(firstError.message);
        return;
      }
      const memberRows = (membersRes.data ?? []) as PartyMember[];
      for (const m of memberRows) memberIds.add(m.id);

      const { data: recordRows, error: recError } = memberRows.length
        ? await supabase
            .from('party_day_records')
            .select('*')
            .in(
              'party_member_id',
              memberRows.map(m => m.id),
            )
        : { data: [], error: null };
      if (recError && !cancelled) setError(recError.message);
      if (cancelled) return;

      setParty((partyRes.data as Party) ?? null);
      setMemberMap(
        Object.fromEntries(memberRows.map(m => [m.id, m])) as Record<
          string,
          PartyMember
        >,
      );
      setRecordMap(
        Object.fromEntries(
          ((recordRows ?? []) as PartyDayRecord[]).map(r => [r.id, r]),
        ),
      );
      void fetchNames(memberRows.map(m => m.user_id));
    };

    const channel = supabase
      .channel(`party-pot:${partyId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'party_members',
          filter: `party_id=eq.${partyId}`,
        },
        payload => {
          if (payload.eventType === 'DELETE') {
            removeMember(payload.old as { id?: string });
          } else {
            applyMember(payload.new as PartyMember);
          }
        },
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'party_day_records' },
        payload => {
          if (payload.eventType === 'DELETE') {
            removeRecord(payload.old as { id?: string });
          } else {
            applyRecord(payload.new as PartyDayRecord);
          }
        },
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'parties',
          filter: `id=eq.${partyId}`,
        },
        payload => {
          setParty(
            payload.eventType === 'DELETE'
              ? null
              : (payload.new as Party),
          );
        },
      )
      .subscribe(status => {
        if (cancelled) return;
        if (status === 'SUBSCRIBED') {
          setConnected(true);
          void load();
        } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          setConnected(false);
          setError(`Realtime subscription ${status.toLowerCase()}.`);
        } else if (status === 'CLOSED') {
          setConnected(false);
        }
      });

    return () => {
      cancelled = true;
      void supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [partyId]);

  return useMemo(() => {
    const members = Object.values(memberMap)
      .sort((a, b) => a.joined_at.localeCompare(b.joined_at))
      .map(m => ({ ...m, display_name: names[m.user_id] ?? null }));

    const dayRecordsByMember: Record<string, PartyDayRecord[]> = {};
    for (const r of Object.values(recordMap)) {
      (dayRecordsByMember[r.party_member_id] ??= []).push(r);
    }
    for (const list of Object.values(dayRecordsByMember)) {
      list.sort((a, b) => a.date.localeCompare(b.date));
    }

    const failedCount = members.filter(m => m.status === 'failed').length;
    const completedCount = members.filter(
      m => m.status === 'completed',
    ).length;

    return {
      party,
      members,
      dayRecordsByMember,
      memberCount: members.length,
      failedCount,
      completedCount,
      potTotal: failedCount * (party?.pledge_amount ?? 0),
      connected,
      error,
    };
  }, [party, memberMap, recordMap, names, connected, error]);
}
