#!/usr/bin/env sh
set -eu
cd "$(dirname "$0")"

command -v node >/dev/null 2>&1 || { echo "ERROR: Node.js 20+ is required"; exit 1; }
node -e "const m=+process.versions.node.split('.')[0]; if(m<20) process.exit(1)" || { echo "ERROR: Node.js 20+ is required"; exit 1; }

npm install
npm run check
npx wrangler login
npm run provision

echo "DONE"
echo "Check /api/health, then open /admin/login"
