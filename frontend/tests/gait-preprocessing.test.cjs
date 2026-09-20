const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');

require.extensions['.ts'] = (module, filename) => {
  const source = fs.readFileSync(filename, 'utf8');
  module._compile(ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText, filename);
};

const { buildModelInputs } = require('../src/services/gaitModelPreprocessing.ts');
const metadata = require('../assets/models/gait_authenticator.metadata.json');
const fixture = require('./fixtures/gait_preprocessing_reference.json');

function maximumDifference(actual, expected) {
  assert.equal(actual.length, expected.length);
  let maximum = 0;
  for (let index = 0; index < actual.length; index += 1) {
    maximum = Math.max(maximum, Math.abs(actual[index] - expected[index]));
  }
  return maximum;
}

test('mobile preprocessing matches the Python training pipeline', () => {
  const inputs = buildModelInputs(fixture.samples, metadata);
  assert.equal(inputs.windowCount, 1);
  assert.ok(maximumDifference(inputs.raw, fixture.expectedNormalizedRaw) < 1e-4);
  assert.ok(maximumDifference(inputs.features, fixture.expectedNormalizedFeatures) < 1e-3);
});
