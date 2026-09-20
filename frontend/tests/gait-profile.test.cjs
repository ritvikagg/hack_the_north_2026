const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');

require.extensions['.ts'] = (module, filename) => {
  const source = fs.readFileSync(filename, 'utf8');
  module._compile(ts.transpileModule(source, {
    compilerOptions: { esModuleInterop: true, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText, filename);
};

const { fitRuntimeGaitProfile, isCompatibleRuntimeProfile, scoreEmbeddingBatch } = require('../src/services/gaitProfile.ts');

function enrollmentEmbeddings(count = 240) {
  return Array.from({ length: count }, (_, window) => Array.from({ length: 64 }, (_, dimension) => (
    Math.sin(window * 0.19 + dimension * 0.07) * 0.08
    + Math.cos(window * 0.05 - dimension * 0.11) * 0.03
    + dimension * 0.002
  )));
}

test('fits a compatible runtime profile from two long calibration walks', () => {
  const embeddings = enrollmentEmbeddings();
  const profile = fitRuntimeGaitProfile(embeddings, 2);
  const score = scoreEmbeddingBatch(embeddings, profile);

  assert.equal(profile.source, 'runtime');
  assert.equal(profile.sessionCount, 2);
  assert.equal(profile.windowCount, 240);
  assert.equal(profile.center.length, 64);
  assert.equal(profile.scale.length, 64);
  assert.ok(profile.scale.every((value) => value >= 0.10));
  assert.ok(score.matchingFraction >= 0.95);
  assert.equal(isCompatibleRuntimeProfile(profile), true);
});

test('rejects a clearly distant embedding', () => {
  const profile = fitRuntimeGaitProfile(enrollmentEmbeddings(), 2);
  const outlier = Array.from({ length: 64 }, () => 10);
  assert.equal(scoreEmbeddingBatch([outlier], profile).matchingFraction, 0);
});

test('requires two sessions and enough walking windows', () => {
  assert.throws(() => fitRuntimeGaitProfile(enrollmentEmbeddings(), 1), /two separate calibration walks/i);
  assert.throws(() => fitRuntimeGaitProfile(enrollmentEmbeddings(99), 2), /not enough walking windows/i);
});
