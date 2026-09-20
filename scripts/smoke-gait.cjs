// Exercise the actual frontend CSV serializer/client through a running Expo proxy.
// This sends synthetic test motion only; it never records a workout or credits money.
const fs = require('node:fs');
const ts = require('typescript');
const assert = require('node:assert/strict');
require.extensions['.ts'] = (module, filename) => module._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, filename);
const origin = process.argv[2] || 'http://localhost:8081';
const originalFetch = globalThis.fetch;
globalThis.fetch = (url, options) => originalFetch(new URL(url, origin), options);
const { scoreGaitCapture, checkGaitService } = require('../src/services/gaitScoring.ts');
const capture = { sessionId: 'integration-smoke', label: 'synthetic_test', samples: Array.from({ length: 1000 }, (_, i) => ({
  tMs: i * 20, sensorTimestampS: i * .02, accel: [0, 0, 9.81 + Math.sin(i / 4)],
  linearAccel: [0, 0, Math.sin(i / 4)], gravity: [0, 0, 9.81], gyro: [.2, .3, .1], orientation: [0, 0, 0],
})) };
(async () => {
  console.log('Backend health:', await checkGaitService());
  const score = await scoreGaitCapture(capture);
  assert.equal(score.feature_values.duration_s, 19.98);
  assert.equal(score.feature_values.sample_rate_hz, 50);
  console.log('Frontend CSV -> Expo proxy -> Python model:', score.decision, score.genuine_probability);
})().catch(error => { console.error(error); process.exitCode = 1; });
