#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")"

if [[ -z "${OPENAI_API_KEY:-}" ]]; then
  echo "OPENAI_API_KEY is required to reproduce vercel/ai issue #15155." >&2
  exit 2
fi

if [[ ! -d node_modules ]]; then
  npm install
fi

npm run start
