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
const { transition, settlePayouts } = require('../src/services/demoEngine.ts');
const now = new Date('2026-09-19T15:00:00Z');
const run = (state, action) => transition(state, action, now);

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

test('create validates the chosen goal; solo starts immediately and party waits in the lobby', () => {
  const input = { mode: 'solo', dailyStepGoal: 10000, requiredDays: 15, pledgeMinor: 500 };
  assert.throws(() => run(createDemoState(now), { type: 'create', input: { ...input, dailyStepGoal: 500 } }), /step goal/);
  assert.throws(() => run(createDemoState(now), { type: 'create', input: { ...input, requiredDays: 0 } }), /duration/);
  assert.throws(() => run(createDemoState(now), { type: 'create', input: { ...input, pledgeMinor: 700 } }), /pledge/);
  const solo = run(createDemoState(now), { type: 'create', input: { ...input, pledgeMinor: 1000 } });
  const c = solo.state.challenges[0];
  assert.equal(c.mode, 'solo');
  assert.equal(c.status, 'active');
  assert.equal(c.dailyStepGoal, 10000);
  assert.equal(c.requiredDays, 15);
  assert.equal(Date.parse(c.endsAt) - Date.parse(c.startsAt), 15 * 86400000);
  const party = run(createDemoState(now), { type: 'create', input: { ...input, mode: 'party' } });
  assert.equal(party.state.challenges[0].status, 'lobby');
});

test('host path adds friends and starts the chosen duration exactly once', () => {
  const created = run(createDemoState(now), { type: 'create', input: { mode: 'party', dailyStepGoal: 8000, requiredDays: 10, pledgeMinor: 1000 } });
  let state = created.state;
  let c = state.challenges[0];
  assert.equal(c.hostId, state.currentUserId);
  assert.equal(c.participants.length, 1);
  assert.throws(() => run(state, { type: 'start', id: c.id }), /at least one friend/);
  state = run(state, { type: 'addFriend', id: c.id }).state;
  state = run(state, { type: 'start', id: c.id }).state;
  c = state.challenges[0];
  assert.equal(c.status, 'active');
  assert.equal(Date.parse(c.endsAt) - Date.parse(c.startsAt), 10 * 86400000);
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

test('days past the target date still count; the challenge stays open until all required days are done', () => {
  let state = createDemoState(now);
  // Target pace date has passed, but a 15-day goal may take 20 calendar days.
  state.challenges[0].endsAt = new Date(now.getTime() - 1).toISOString();
  const before = state.challenges[0].participants[0].completedDays;
  state = run(state, { type: 'addDay', id: 'weekly-stride' }).state;
  assert.equal(state.challenges[0].participants[0].completedDays, before + 1);
  assert.equal(state.challenges[0].status, 'active');
});

test('completing every required day settles automatically and returns the full deposit', () => {
  let { state, id } = run(createDemoState(now), { type: 'create', input: { mode: 'solo', dailyStepGoal: 10000, requiredDays: 3, pledgeMinor: 1000 } });
  for (let i = 0; i < 3; i++) state = run(state, { type: 'addDay', id }).state;
  const c = state.challenges[0];
  assert.equal(c.status, 'settled');
  assert.deepEqual(c.payouts, [{ userId: 'you', pledgeReturnedMinor: 1000, totalMinor: 1000 }]);
  assert.equal(c.charityMinor, 0);
  assert.equal(state.runs.filter((r) => r.challengeId === id).length, 3);
  assert.throws(() => run(state, { type: 'addDay', id }), /no longer accepting/);
});

test('ending early returns deposits only to finishers; the rest goes to charity', () => {
  const challenge = createDemoState(now).challenges[0];
  for (let winners = 0; winners <= 4; winners++) {
    const c = structuredClone(challenge);
    c.participants.forEach((p, i) => { p.completedDays = i < winners ? c.requiredDays : 0; });
    const { payouts, charityMinor } = settlePayouts(c);
    assert.equal(payouts.reduce((sum, p) => sum + p.totalMinor, 0) + charityMinor, 2000);
    assert.equal(charityMinor, (4 - winners) * 500);
    assert.ok(payouts.every((p, i) => p.totalMinor === (i < winners ? 500 : 0) && p.pledgeReturnedMinor === p.totalMinor));
  }
});

test('only the host settles early; settling twice changes nothing', () => {
  const state = createDemoState(now);
  const asFriend = structuredClone(state);
  asFriend.currentUserId = 'maya';
  assert.throws(() => run(asFriend, { type: 'settle', id: 'weekly-stride' }), /host/);
  const settled = run(state, { type: 'settle', id: 'weekly-stride' }).state;
  const c = settled.challenges[0];
  assert.equal(c.status, 'settled');
  assert.equal(c.charityMinor, 2000);
  assert.equal(c.payouts.find((p) => p.userId === 'you').totalMinor, 0);
  assert.deepEqual(run(settled, { type: 'settle', id: 'weekly-stride' }).state, settled);
});

test('reset restores the initial invitations', () => {
  const reset = run(createDemoState(now), { type: 'reset' }).state;
  assert.equal(reset.challenges.length, 2);
  assert.equal(reset.challenges[1].participants.some((p) => p.userId === 'you'), false);
});
