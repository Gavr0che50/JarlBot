#!/usr/bin/env sh
cd "$(dirname "$0")" || exit 1

if ! command -v node >/dev/null 2>&1; then
  echo "Node.js 24+ est requis: https://nodejs.org"
  exit 1
fi

if [ ! -d node_modules ]; then
  echo "Installation des dependances JarlBot..."
  npm install || exit 1
fi

node scripts/launcher.js
