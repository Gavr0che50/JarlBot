#!/usr/bin/env sh
set -eu

cd "$(dirname "$0")" || exit 1

echo "Arret des anciennes instances JarlBot..."
if command -v pkill >/dev/null 2>&1; then
  pkill -f "node .*index\\.js" >/dev/null 2>&1 || true
  pkill -f "node .*scripts/launcher\\.js" >/dev/null 2>&1 || true
  pkill -f "node .*deploy-commands\\.js" >/dev/null 2>&1 || true
  pkill -f "node .*eva-refresh\\.js" >/dev/null 2>&1 || true
fi

if ! command -v node >/dev/null 2>&1; then
  echo "Node.js 24+ est requis."
  echo "Installe-le depuis https://nodejs.org ou via NodeSource, puis relance ./launcher.sh"
  exit 1
fi

NODE_MAJOR="$(node -v | sed 's/^v//' | cut -d. -f1)"
if [ "${NODE_MAJOR:-0}" -lt 24 ]; then
  echo "Node.js 24+ est requis. Version detectee: $(node -v)"
  exit 1
fi

if ! command -v npm >/dev/null 2>&1; then
  echo "npm est introuvable. Reinstalle Node.js 24+ avec npm."
  exit 1
fi

if [ ! -d node_modules ]; then
  echo "Installation des dependances JarlBot..."
  npm install
fi

echo "Demarrage du launcher local JarlBot..."
node scripts/launcher.js
