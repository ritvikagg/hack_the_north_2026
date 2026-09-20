const { spawn, spawnSync } = require('node:child_process');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const candidates = process.env.PLEDGEFIT_PYTHON
  ? [process.env.PLEDGEFIT_PYTHON]
  : [path.join(root, '.python', 'python.exe'), path.join(root, '.venv', 'Scripts', 'python.exe'), path.join(root, '.venv', 'bin', 'python'), 'python', 'python3', 'py'];
const python = candidates.find(command => spawnSync(command, ['-c', 'import numpy'], { cwd: root, windowsHide: true, stdio: 'ignore' }).status === 0);
if (!python) {
  console.error('No working Python with NumPy found. Install Python 3.10+ and run: python -m pip install -r requirements.txt');
  console.error('Or set PLEDGEFIT_PYTHON to your Python executable.');
  process.exit(1);
}
const child = spawn(python, ['-B', '-u', 'service/gait_scoring_api.py'], { cwd: root, stdio: 'inherit', windowsHide: true });
child.on('error', error => { console.error(error.message); process.exit(1); });
child.on('exit', code => process.exit(code ?? 1));
process.on('SIGINT', () => child.kill());
process.on('SIGTERM', () => child.kill());
