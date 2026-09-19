const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
// Keep the pure domain tests independent of React Native and device storage.
require.extensions['.ts'] = (module, filename) => {
  const source = fs.readFileSync(filename, 'utf8');
  module._compile(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, filename);
};
const { createDemoState } = require('../src/services/demoFixtures.ts');
const { transition, generateGoal, settlePayouts } = require('../src/services/demoEngine.ts');
const now = new Date('2026-09-19T15:00:00Z');
const run = (state, action, random = () => .5) => transition(state, action, now, random);

test('joining adds exactly one equal pledge; retries do not duplicate membership', () => {
  const initial = createDemoState(now);
  const joined = run(initial, { type: 'join', code: ' stride ' });
  assert.equal(joined.id, 'scenic-lobby');
  assert.equal(joined.state.challenges[1].participants.length, 3);
  assert.equal(initial.challenges[1].participants.length, 2);
  assert.equal(joined.state.challenges[1].participants.length * joined.state.challenges[1].pledgeMinor, 1500);
  const retry = run(joined.state, { type: 'join', code: 'STRIDE' });
  assert.equal(retry.state.challenges[1].participants.length, 3);
  assert.throws(() => run(initial, { type: 'join', code: 'WRONG' }), /No pot/);
});

test('host path generates a goal, adds friends, and starts exactly seven days', () => {
  const created = run(createDemoState(now), { type: 'create', input: { difficulty: 'medium', pledgeMinor: 1000 } });
  let state = created.state;
  let c = state.challenges[0];
  assert.equal(c.hostId, state.currentUserId);
  assert.equal(c.participants.length, 1);
  assert.equal(c.pledgeMinor, 1000);
  assert.throws(() => run(state, { type: 'start', id: c.id }), /at least one friend/);
  state = run(state, { type: 'addFriend', id: c.id }).state;
  state = run(state, { type: 'start', id: c.id }).state;
  c = state.challenges[0];
  assert.equal(c.status, 'active');
  assert.equal(Date.parse(c.endsAt) - Date.parse(c.startsAt), 7 * 86400000);
  assert.throws(() => run(state, { type: 'start', id: c.id }), /already started/);
  assert.throws(() => run(state, { type: 'addFriend', id: c.id }), /Joining is closed/);
});

test('nonhost cannot start, but explicit demo host simulation can', () => {
  const joined = run(createDemoState(now), { type: 'join', code: 'STRIDE' });
  assert.throws(() => run(joined.state, { type: 'start', id: joined.id }), /Only the host/);
  const active = run(joined.state, { type: 'demoHostStart', id: joined.id }).state;
  assert.equal(active.challenges[1].status, 'active');
  const outsider = structuredClone(active);
  outsider.currentUserId = 'emma';
  assert.throws(() => run(outsider, { type: 'join', code: 'STRIDE' }), /Joining is closed/);
});

test('votes require strict majority, count each member once, and replace only once', () => {
  let { state, id } = run(createDemoState(now), { type: 'create', input: { difficulty: 'easy', pledgeMinor: 500 } });
  state = run(state, { type: 'addFriend', id }).state;
  state = run(state, { type: 'vote', id }).state;
  assert.equal(state.challenges[0].replacementUsed, false);
  state = run(state, { type: 'vote', id }).state;
  assert.equal(state.challenges[0].replacementVotes.length, 1);
  const goal = state.challenges[0];
  state = run(state, { type: 'friendVote', id }).state;
  assert.equal(state.challenges[0].replacementUsed, true);
  assert.equal(state.challenges[0].difficulty, 'easy');
  assert.notDeepEqual([state.challenges[0].requiredRuns, state.challenges[0].minimumDistanceMeters], [goal.requiredRuns, goal.minimumDistanceMeters]);
  assert.throws(() => run(state, { type: 'vote', id }), /no longer available/);
});

test('generated goals vary within difficulty; replacement cannot repeat even with identical RNG', () => {
  for (const difficulty of ['easy', 'medium', 'hard']) {
    const low = generateGoal(difficulty, () => 0);
    const high = generateGoal(difficulty, () => .99999);
    assert.notDeepEqual(low, high);
    const replacement = generateGoal(difficulty, () => 0, low);
    assert.notEqual(replacement.minimumDistanceMeters, low.minimumDistanceMeters);
  }
});

test('participant can add runs, reach the goal, and receive a conserving final payout', () => {
  let state = createDemoState(now);
  state = run(state, { type: 'addRun', id: 'weekly-stride' }).state;
  assert.equal(state.challenges[0].participants[0].verifiedRuns, 3);
  assert.equal(state.runs.filter((r) => r.userId === 'you').length, 3);
  assert.throws(() => run(state, { type: 'addRun', id: 'weekly-stride' }), /already complete/);
  state = run(state, { type: 'settle', id: 'weekly-stride' }).state;
  const payouts = state.challenges[0].payouts;
  assert.deepEqual(payouts.find((p) => p.userId === 'you'), { userId: 'you', pledgeReturnedMinor: 500, bonusMinor: 500, totalMinor: 1000 });
  assert.equal(payouts.reduce((sum, p) => sum + p.totalMinor, 0), 2000);
  assert.deepEqual(run(state, { type: 'settle', id: 'weekly-stride' }).state, state);
  assert.throws(() => run(state, { type: 'addRun', id: 'weekly-stride' }), /no longer accepting/);
});

test('all-fail refunds, all-finish returns and cent remainders conserve the pot', () => {
  const challenge = createDemoState(now).challenges[0];
  for (let winners = 0; winners <= 4; winners++) {
    const c = structuredClone(challenge);
    c.participants.forEach((p, i) => { p.verifiedRuns = i < winners ? c.requiredRuns : 0; });
    const payouts = settlePayouts(c);
    assert.equal(payouts.reduce((sum, p) => sum + p.totalMinor, 0), 2000);
    assert.ok(payouts.every((p) => Number.isInteger(p.totalMinor) && p.totalMinor >= 0));
    if (winners === 0 || winners === 4) assert.ok(payouts.every((p) => p.totalMinor === 500));
    if (winners === 3) assert.deepEqual(payouts.map((p) => p.totalMinor), [667, 667, 666, 0]);
  }
});

test('expired active challenge rejects activity and reset restores invitations', () => {
  const state = createDemoState(now);
  state.challenges[0].endsAt = new Date(now.getTime() - 1).toISOString();
  assert.throws(() => run(state, { type: 'addRun', id: 'weekly-stride' }), /no longer accepting/);
  const reset = run(state, { type: 'reset' }).state;
  assert.equal(reset.challenges.length, 2);
  assert.equal(reset.challenges[1].participants.some((p) => p.userId === 'you'), false);
});
