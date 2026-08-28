const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const root = path.resolve(__dirname, '..');
const dataDir = path.join(root, 'data');
const authFile = path.join(dataDir, 'admin-auth.json');
const login = String(process.env.ADMIN_LOGIN || process.argv[2] || 'airus-admin').trim();
const password = String(process.env.ADMIN_PASSWORD || crypto.randomBytes(15).toString('base64url'));
const salt = crypto.randomBytes(24).toString('hex');
const passwordHash = crypto.scryptSync(password, salt, 64).toString('hex');

fs.mkdirSync(dataDir, { recursive: true });
fs.writeFileSync(authFile, JSON.stringify({ login, salt, passwordHash, updatedAt: new Date().toISOString() }, null, 2), { mode: 0o600 });
try { fs.chmodSync(authFile, 0o600); } catch (_) {}

console.log(`Admin login: ${login}`);
console.log(`New admin password: ${password}`);
console.log('Save the password now. The file stores only its secure hash.');
