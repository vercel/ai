#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."

pnpm --dir packages/xai exec vitest --config vitest.node.config.js --run src/issue-12825-repro.test.ts
