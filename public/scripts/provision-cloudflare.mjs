import { readFileSync, writeFileSync, unlinkSync, existsSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');
const configPath = resolve(root, 'wrangler.jsonc');
const tempSecretsPath = resolve(root, '.airus-deploy-secrets.json');
const isWindows = process.platform === 'win32';
const npx = isWindows ? 'npx.cmd' : 'npx';

function run(args, options = {}) {
  console.log(`\n> npx ${args.join(' ')}`);
  const result = spawnSync(npx, args, {
    cwd: root,
    stdio: options.capture ? ['ignore', 'pipe', 'pipe'] : ['inherit', 'inherit', 'inherit'],
    encoding: 'utf8',
    env: process.env
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    const details = options.capture ? `\n${result.stdout || ''}\n${result.stderr || ''}` : '';
    throw new Error(`Command failed (${result.status}): npx ${args.join(' ')}${details}`);
  }
  return options.capture ? String(result.stdout || '') : '';
}

function readConfig() {
  return JSON.parse(readFileSync(configPath, 'utf8'));
}

function writeConfig(config) {
  writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`, 'utf8');
}

function parseJsonOutput(output) {
  const firstArray = output.indexOf('[');
  const firstObject = output.indexOf('{');
  const start = firstArray >= 0 && firstObject >= 0 ? Math.min(firstArray, firstObject) : Math.max(firstArray, firstObject);
  if (start < 0) throw new Error('Wrangler did not return JSON');
  return JSON.parse(output.slice(start));
}

function normalizeD1List(data) {
  if (Array.isArray(data)) return data;
  if (Array.isArray(data?.result)) return data.result;
  if (Array.isArray(data?.databases)) return data.databases;
  return [];
}

console.log('AIRUS Cloudflare provisioning v3');
let config = readConfig();
const workerName = config.name || 'airus';
const databaseName = `${workerName}-db`;
const bindings = Array.isArray(config.d1_databases) ? config.d1_databases : [];
let binding = bindings.find((item) => item?.binding === 'DB');
if (!binding) {
  binding = { binding: 'DB' };
  bindings.push(binding);
  config.d1_databases = bindings;
  writeConfig(config);
}

if (!binding.database_id || !binding.database_name) {
  console.log(`Looking for D1 database: ${databaseName}`);
  let databases = [];
  try {
    databases = normalizeD1List(parseJsonOutput(run(['wrangler', 'd1', 'list', '--json'], { capture: true })));
  } catch (error) {
    console.warn(`Could not parse D1 list: ${error.message}`);
  }

  let database = databases.find((item) => item?.name === databaseName || item?.database_name === databaseName);
  if (!database) {
    run(['wrangler', 'd1', 'create', databaseName, '--binding', 'DB', '--update-config']);
    databases = normalizeD1List(parseJsonOutput(run(['wrangler', 'd1', 'list', '--json'], { capture: true })));
    database = databases.find((item) => item?.name === databaseName || item?.database_name === databaseName);
  }

  if (!database) throw new Error(`D1 database ${databaseName} was not found after creation`);
  const databaseId = database.uuid || database.database_id || database.id;
  if (!databaseId) throw new Error('Cloudflare returned D1 database without an id');

  config = readConfig();
  const dbBinding = config.d1_databases?.find((item) => item?.binding === 'DB') || {};
  dbBinding.binding = 'DB';
  dbBinding.database_name = databaseName;
  dbBinding.database_id = databaseId;
  dbBinding.migrations_dir = 'migrations';
  if (!Array.isArray(config.d1_databases)) config.d1_databases = [];
  const index = config.d1_databases.findIndex((item) => item?.binding === 'DB');
  if (index >= 0) config.d1_databases[index] = dbBinding;
  else config.d1_databases.push(dbBinding);
  writeConfig(config);
  console.log(`D1 bound: ${databaseName}`);
} else {
  console.log(`D1 already configured: ${binding.database_name}`);
}

console.log('\nApplying D1 migrations');
run(['wrangler', 'd1', 'migrations', 'apply', 'DB', '--remote']);

console.log('\nGenerating SESSION_SECRET and deploying it together with Worker');
const sessionSecret = randomBytes(48).toString('base64url');
writeFileSync(tempSecretsPath, JSON.stringify({ SESSION_SECRET: sessionSecret }, null, 2), { encoding: 'utf8', mode: 0o600 });
try {
  run(['wrangler', 'deploy', '--secrets-file', tempSecretsPath]);
} finally {
  if (existsSync(tempSecretsPath)) unlinkSync(tempSecretsPath);
}

console.log('\nVerifying secret binding');
const secretListRaw = run(['wrangler', 'secret', 'list', '--json'], { capture: true });
let secretNames = [];
try {
  const parsed = parseJsonOutput(secretListRaw);
  const rows = Array.isArray(parsed) ? parsed : (parsed?.result || []);
  secretNames = rows.map((item) => item?.name).filter(Boolean);
} catch (_) {
  // Older/newer Wrangler output can differ. Health endpoint remains the final check.
}
if (secretNames.length && !secretNames.includes('SESSION_SECRET')) {
  throw new Error('SESSION_SECRET was not found after deployment');
}

console.log('\nAIRUS deployment completed.');
console.log('Open /api/health. It must report session=configured.');
console.log('Then open /admin/login and sign in.');
