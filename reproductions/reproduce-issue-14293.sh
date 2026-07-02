#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."

(
  cd packages/workflow
  pnpm exec vitest --config vitest.node.config.js --run src/issue-14293.repro.test.ts
)
