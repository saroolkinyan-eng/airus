#!/bin/sh
set -eu
cd "$(dirname "$0")"

if ! command -v node >/dev/null 2>&1; then
  echo "ERROR: Node.js 20+ is required" >&2
  exit 1
fi

node -e "const m=+process.versions.node.split('.')[0]; if(m<20){console.error('ERROR: Node.js 20+ is required'); process.exit(1)}"

echo "[1/4] Installing dependencies"
npm install

echo "[2/4] Checking project"
npm run check

echo "[3/4] Cloudflare login"
npx wrangler login

echo "[4/4] Deploying Worker and provisioning D1"
npm run deploy

echo "Done. Open the workers.dev URL printed above and check /healthz"
