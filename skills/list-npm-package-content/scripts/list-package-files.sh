#!/usr/bin/env bash
set -e

# Build, pack, list contents, cleanup
pnpm build
pnpm pack
tar -tzf *.tgz
rm *.tgz
