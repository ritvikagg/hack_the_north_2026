/// <reference types="jest" />
// Unit tests for the Party Pot client API with a mocked supabase client.
// (No local Supabase available — these verify the guard logic and error
// mapping; the RLS behavior they assume is documented in supabase/README.md.)
import { supabase } from './supabase';
import { joinParty, leaveParty } from './parties';

jest.mock('./supabase', () => ({
  supabase: {
    auth: { getUser: jest.fn() },
    from: jest.fn(),
  },
}));

const mockFrom = supabase.from as jest.Mock;
const mockGetUser = supabase.auth.getUser as jest.Mock;

interface Step {
  table: string;
  result: { data?: unknown; error?: unknown; count?: number | null };
}

/** Minimal thenable stand-in for the PostgREST query builder. */
function makeBuilder(result: Step['result']) {
  const builder: Record<string, unknown> = {};
  for (const m of ['select', 'insert', 'update', 'delete', 'eq', 'in', 'order']) {
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

beforeEach(() => {
  jest.clearAllMocks();
  mockGetUser.mockResolvedValue({
    data: { user: { id: 'user-1' } },
    error: null,
  });
});

describe('joinParty', () => {
  it('rejects when the user already joined', async () => {
    queueResponses([
      { table: 'parties', result: { data: { id: 'p1', status: 'open' } } },
      {
        table: 'party_members',
        result: { data: { id: 'm1', party_id: 'p1', user_id: 'user-1' } },
      },
    ]);
    await expect(joinParty('p1')).rejects.toThrow(/already joined/i);
  });

  it('rejects on a unique-violation race during insert', async () => {
    queueResponses([
      { table: 'parties', result: { data: { id: 'p1', status: 'open' } } },
      { table: 'party_members', result: { data: null } },
      {
        table: 'party_members',
        result: { data: null, error: { code: '23505', message: 'duplicate key' } },
      },
    ]);
    await expect(joinParty('p1')).rejects.toThrow(/already joined/i);
  });

  it('rejects when the party has already started', async () => {
    queueResponses([
      { table: 'parties', result: { data: { id: 'p1', status: 'active' } } },
      { table: 'party_members', result: { data: null } },
    ]);
    await expect(joinParty('p1')).rejects.toThrow(/already started/i);
  });
});

describe('leaveParty', () => {
  it('rejects when the party is no longer open', async () => {
    queueResponses([
      { table: 'parties', result: { data: { id: 'p1', status: 'active' } } },
    ]);
    await expect(leaveParty('p1')).rejects.toThrow(/still open/i);
  });
});
