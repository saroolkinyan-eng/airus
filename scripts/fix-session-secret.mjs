import { randomBytes } from 'node:crypto';
import { spawnSync } from 'node:child_process';

const npx = process.platform === 'win32' ? 'npx.cmd' : 'npx';
const secret = randomBytes(48).toString('base64url');

function run(args, options = {}) {
  console.log(`> npx ${args.join(' ')}`);
  const result = spawnSync(npx, args, {
    stdio: options.input ? ['pipe', 'inherit', 'inherit'] : 'inherit',
    input: options.input,
    encoding: 'utf8',
    env: process.env
  });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}

// Target the already deployed Worker directly. This does not recreate or rebind D1.
run(['wrangler', 'secret', 'put', 'SESSION_SECRET', '--name', 'airus'], { input: `${secret}\n` });
run(['wrangler', 'secret', 'list', '--name', 'airus']);
console.log('SESSION_SECRET uploaded to Worker airus. No D1 changes were made.');
