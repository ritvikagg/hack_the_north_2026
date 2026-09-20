const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');

require.extensions['.ts'] = (module, filename) => {
  const source = fs.readFileSync(filename, 'utf8');
  module._compile(ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText, filename);
};

const { buildGroupInvitePayload, parseGroupInvitePayload } = require('../src/services/groupInvite.ts');

test('round-trips a normalized group invite code', () => {
  const payload = buildGroupInvitePayload('  a1b2c3  ');
  assert.equal(payload, 'pledgefit://groups?v=1&invite=A1B2C3');
  assert.equal(parseGroupInvitePayload(payload), 'A1B2C3');
});

test('rejects unrelated, malformed, and unsupported QR payloads', () => {
  const invalid = [
    'https://example.com/groups?v=1&invite=A1B2C3',
    'pledgefit://challenges?v=1&invite=A1B2C3',
    'pledgefit://groups?v=2&invite=A1B2C3',
    'pledgefit://groups?v=1&invite=NOT_ALLOWED!',
    'A1B2C3',
  ];

  for (const payload of invalid) assert.equal(parseGroupInvitePayload(payload), null);
});

test('refuses to generate invalid invite payloads', () => {
  assert.throws(() => buildGroupInvitePayload(''), /invalid group invite code/i);
  assert.throws(() => buildGroupInvitePayload('not allowed!'), /invalid group invite code/i);
});
