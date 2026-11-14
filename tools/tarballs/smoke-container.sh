#!/usr/bin/env bash
set -euo pipefail

: "${TARBALLS_URL:?Set TARBALLS_URL to the immutable deployment origin}"
: "${TARBALLS_SHA:?Set TARBALLS_SHA to the deployed commit}"

cd "$(dirname "$0")"
docker build --tag ai-tarballs-smoke --file Dockerfile.smoke .

# Imported preview code can emit arbitrary stdout. Do not interpret it as
# Actions workflow commands (for example, add-path or set-env).
command_token=$(openssl rand -hex 32)
printf '::stop-commands::%s\n' "$command_token"
trap 'printf "::%s::\n" "$command_token"' EXIT

# Only public deployment metadata crosses the boundary. No runner filesystem,
# action directory, caches, Docker socket, or credential environment is shared.
docker run --rm \
  --read-only \
  --user 1000:1000 \
  --cap-drop ALL \
  --security-opt no-new-privileges \
  --pids-limit 256 \
  --memory 2g \
  --cpus 2 \
  --tmpfs /tmp:rw,nosuid,nodev,size=2g,mode=1777 \
  --env TARBALLS_URL \
  --env TARBALLS_SHA \
  ai-tarballs-smoke
