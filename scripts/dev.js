const { spawn } = require('child_process');
const path = require('path');

const repositoryRoot = path.resolve(__dirname, '..');
const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const children = [
  spawn(npmCommand, ['run', 'dev:frontend'], {
    cwd: repositoryRoot,
    stdio: 'inherit',
    shell: process.platform === 'win32',
  }),
  spawn(process.execPath, ['backend/realtime/socket-server.js'], { cwd: repositoryRoot, stdio: 'inherit' }),
];

let stopping = false;

function stopChildren(signal = 'SIGTERM') {
  if (stopping) return;
  stopping = true;
  for (const child of children) {
    if (!child.killed) child.kill(signal);
  }
}

for (const child of children) {
  child.on('error', (error) => {
    console.error(`[dev] Unable to start a required service: ${error.message}`);
    stopChildren();
    process.exitCode = 1;
  });
  child.on('exit', (code, signal) => {
    if (stopping) return;
    if (code && code !== 0) {
      console.error(`[dev] A required service exited with code ${code}.`);
      process.exitCode = code;
    } else if (signal) {
      console.error(`[dev] A required service stopped (${signal}).`);
      process.exitCode = 1;
    }
    stopChildren();
  });
}

process.once('SIGINT', () => stopChildren('SIGINT'));
process.once('SIGTERM', () => stopChildren('SIGTERM'));

console.log('[dev] GradTrack frontend and realtime messaging service are starting.');
console.log('[dev] The PHP API continues to be served by the configured XAMPP/Apache instance.');
