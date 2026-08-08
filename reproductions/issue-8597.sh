#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."

pnpm --dir packages/react exec vitest --config vitest.config.js --run src/use-chat.issue-8597.test.tsx
