#!/usr/bin/env node
const path = require('path');
const { spawnSync } = require('child_process');
const fs = require('fs');

const pkgRoot = path.join(__dirname, '..');
const composePath = path.join(pkgRoot, 'docker-compose.yml');
const cwd = process.cwd();
const envFile = path.join(cwd, '.env');
const hasEnv = fs.existsSync(envFile);

const cmd = process.argv[2] || 'start';

function composeArgs(sub) {
  const a = ['compose', '-f', composePath];
  if (hasEnv) a.push('--env-file', envFile);
  return a.concat(sub);
}

if (cmd === 'update') {
  const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
  const r = spawnSync(npm, ['update', 'el-contador'], { cwd, stdio: 'inherit' });
  if (r.status !== 0) process.exit(r.status || 1);
  console.log('Rebuilding and starting containers...');
}

if (cmd === 'start' || cmd === 'up' || cmd === 'update') {
  if (!fs.existsSync(composePath)) {
    console.error('el-contador: docker-compose.yml not found at', composePath);
    process.exit(1);
  }
  if (!hasEnv) console.warn('el-contador: no .env in current directory; copy from node_modules/el-contador/.env.example');
  const args = composeArgs(['up', '-d']);
  if (cmd === 'update') args.push('--build');
  const r = spawnSync('docker', args, { stdio: 'inherit', cwd });
  process.exit(r.status !== null ? r.status : 1);
} else if (cmd === 'down' || cmd === 'stop') {
  const r = spawnSync('docker', composeArgs(['down']), { stdio: 'inherit', cwd });
  process.exit(r.status !== null ? r.status : 1);
} else {
  console.log('Usage: el-contador [start|up|down|stop|update]');
  console.log('  start, up   Start the app (default). Requires .env in current directory.');
  console.log('  down, stop  Stop containers.');
  console.log('  update      Run npm update el-contador then rebuild and start.');
  process.exit(1);
}
