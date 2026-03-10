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

// Escape for safe use in a shell command (single-quote style)
function shQuote(s) {
  return "'" + String(s).replace(/'/g, "'\"'\"'") + "'";
}

function getDockerComposeCmd() {
  const r1 = spawnSync(
    process.platform === 'win32' ? 'cmd' : 'sh',
    [process.platform === 'win32' ? '/c' : '-c', 'docker compose version'],
    { stdio: 'ignore' }
  );
  if (r1.status === 0) return 'docker compose';

  const r2 = spawnSync(
    process.platform === 'win32' ? 'cmd' : 'sh',
    [process.platform === 'win32' ? '/c' : '-c', 'docker-compose version'],
    { stdio: 'ignore' }
  );
  if (r2.status === 0) return 'docker-compose';

  console.error('el-contador: need "docker compose" or "docker-compose". Install Docker and Docker Compose.');
  process.exit(1);
}

// Run compose. Use --project-directory so the build context is the package root (where
// docker-compose.yml lives), not the user's cwd (e.g. admin/). Otherwise COPY server/
// and COPY frontend/ would look in the wrong place when running from a sibling of the app.
function runCompose(subargs) {
  const composeCmd = getDockerComposeCmd();
  const projectDir = path.resolve(pkgRoot);
  const envPart = hasEnv ? ' --env-file ' + shQuote(envFile) : '';
  const cmd = composeCmd + ' --project-directory ' + shQuote(projectDir) + ' -f ' + shQuote(composePath) + envPart + ' ' + subargs.join(' ');
  
  const r = spawnSync(
    process.platform === 'win32' ? 'cmd' : 'sh',
    [process.platform === 'win32' ? '/c' : '-c', cmd],
    { stdio: 'inherit', cwd }
  );
  
  if (r.status !== 0) {
    process.exit(r.status || 1);
  }
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
  
  // Always build to ensure we use the latest files from node_modules/el-contador
  const subargs = ['up', '-d', '--build'];
  runCompose(subargs);
} else if (cmd === 'down' || cmd === 'stop') {
  runCompose(['down']);
} else {
  console.log('Usage: el-contador [start|up|down|stop|update]');
  console.log('  start, up   Start the app (default). Requires .env in current directory.');
  console.log('  down, stop  Stop containers.');
  console.log('  update      Run npm update el-contador then rebuild and start.');
  process.exit(1);
}
