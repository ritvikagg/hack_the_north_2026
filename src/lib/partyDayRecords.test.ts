/// <reference types="jest" />
// Unit tests for recordPartyDay with a mocked supabase client — same
// approach as parties.test.ts. These cover the ownership/active-party
// guards and the RPC handoff; the RLS behavior they assume is documented
// in supabase/README.md.
import { supabase } from './supabase';
import { recordPartyDay } from './partyDayRecords';

jest.mock('./supabase', () => ({
  supabase: {
    auth: { getUser: jest.fn() },
    from: jest.fn(),
    rpc: jest.fn(),
  },
}));

const mockFrom = supabase.from as jest.Mock;
const mockRpc = supabase.rpc as jest.Mock;
const mockGetUser = supabase.auth.getUser as jest.Mock;

interface Step {
  table: string;
  result: { data?: unknown; error?: unknown };
}

/** Minimal thenable stand-in for the PostgREST query builder. */
function makeBuilder(result: Step['result']) {
  const builder: Record<string, unknown> = {};
  for (const m of [
    'select',
    'insert',
    'upsert',
    'update',
    'delete',
    'eq',
    'in',
    'order',
  ]) {
    builder[m] = jest.fn(() => builder);
  }
  builder.single = jest.fn(async () => result);
  builder.maybeSingle = jest.fn(async () => result);
  builder.then = (onFulfilled: unknown, onRejected: unknown) =>
    Promise.resolve(result).then(
      onFulfilled as () => unknown,
      onRejected as () => unknown,
    );
  return builder;
}

/** Each supabase.from(table) call pops the next queued result for that table. */
function queueResponses(steps: Step[]) {
  const queues = new Map<string, Step['result'][]>();
  for (const s of steps) {
    queues.set(s.table, [...(queues.get(s.table) ?? []), s.result]);
  }
  mockFrom.mockImplementation((table: string) => {
    const queue = queues.get(table) ?? [];
    return makeBuilder(queue.length ? queue.shift()! : { data: null });
  });
}

const MY_MEMBER = {
  id: 'm1',
  party_id: 'p1',
  user_id: 'user-1',
  status: 'active',
};
const ACTIVE_PARTY = {
  id: 'p1',
  status: 'active',
  start_date: '2026-09-01',
  total_days: 15, // window: 2026-09-01 … 2026-09-15
};

beforeEach(() => {
  jest.clearAllMocks();
  mockGetUser.mockResolvedValue({
    data: { user: { id: 'user-1' } },
    error: null,
  });
});

describe('recordPartyDay', () => {
  it("rejects a member id that isn't the caller's", async () => {
    queueResponses([
      {
        table: 'party_members',
        result: { data: { ...MY_MEMBER, user_id: 'someone-else' } },
      },
    ]);
    await expect(
      recordPartyDay('m1', '2026-09-05', 'hit', 9000),
    ).rejects.toThrow(/yourself/i);
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it('rejects when the party is not active', async () => {
    queueResponses([
      { table: 'party_members', result: { data: MY_MEMBER } },
      {
        table: 'parties',
        result: { data: { ...ACTIVE_PARTY, status: 'open' } },
      },
    ]);
    await expect(
      recordPartyDay('m1', '2026-09-05', 'hit', 9000),
    ).rejects.toThrow(/not active/i);
  });

  it('rejects a date outside the party window', async () => {
    queueResponses([
      { table: 'party_members', result: { data: MY_MEMBER } },
      { table: 'parties', result: { data: ACTIVE_PARTY } },
    ]);
    await expect(
      recordPartyDay('m1', '2026-09-16', 'hit', 9000),
    ).rejects.toThrow(/outside/i);
  });

  it('upserts the record and returns the refreshed member status', async () => {
    const saved = {
      id: 'r1',
      party_member_id: 'm1',
      date: '2026-09-15',
      status: 'missed',
      actual_steps: 3000,
    };
    queueResponses([
      { table: 'party_members', result: { data: MY_MEMBER } },
      { table: 'parties', result: { data: ACTIVE_PARTY } },
      { table: 'party_day_records', result: { data: saved } },
    ]);
    mockRpc.mockResolvedValue({ data: 'failed', error: null });

    const result = await recordPartyDay('m1', '2026-09-15', 'missed', 3000);

    expect(result.record).toEqual(saved);
    expect(result.memberStatus).toBe('failed');
    expect(mockRpc).toHaveBeenCalledWith('refresh_member_status', {
      p_member_id: 'm1',
    });
  });
});
