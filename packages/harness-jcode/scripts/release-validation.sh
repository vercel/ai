#!/usr/bin/env bash
# Production-equivalent release validation for Jcode + @ai-sdk/harness-jcode.
#
# This script only writes to a temporary directory. It builds release binaries,
# packs publishable-equivalent npm artifacts, installs them into a clean consumer,
# launches the bundled runtime, and verifies the external-tools capability.
set -euo pipefail

if [[ -x "${HOME:-}/.cargo/bin/cargo" ]]; then
  export PATH="$HOME/.cargo/bin:$PATH"
fi

AI_REPO="${AI_REPO:-$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)}"
JCODE_REPO="${JCODE_REPO:-/Users/joan/wrk/jcode}"
KEEP_WORK="${KEEP_WORK:-0}"
RUN_VERCEL_SANDBOX="${RUN_VERCEL_SANDBOX:-auto}"

package_dir="$AI_REPO/packages/harness-jcode"
work="$(mktemp -d "${TMPDIR:-/tmp}/harness-jcode-release-XXXXXX")"
cleanup() {
  if [[ "$KEEP_WORK" == 1 ]]; then
    echo "kept validation workspace: $work"
  else
    rm -rf "$work"
  fi
}
trap cleanup EXIT

require() {
  command -v "$1" >/dev/null 2>&1 || {
    echo "BLOCKED: required command not found: $1" >&2
    exit 1
  }
}
require cargo
require node
require npm
require pnpm

[[ -f "$JCODE_REPO/Cargo.toml" ]] || {
  echo "BLOCKED: JCODE_REPO is not a Jcode checkout: $JCODE_REPO" >&2
  exit 1
}
[[ -f "$package_dir/package.json" ]] || {
  echo "BLOCKED: AI_REPO does not contain packages/harness-jcode: $AI_REPO" >&2
  exit 1
}

sdk_version="$(node -p "require('$JCODE_REPO/sdk/typescript/package.json').version")"
harness_sdk_version="$(node -p "require('$package_dir/package.json').dependencies['@1jehuang/jcode-sdk']")"
bridge_sdk_version="$(node -p "require('$package_dir/src/bridge/package.json').dependencies['@1jehuang/jcode-sdk']")"
if [[ "$harness_sdk_version" != "$sdk_version" || "$bridge_sdk_version" != "$sdk_version" ]]; then
  echo "BLOCKED: SDK versions differ: sdk=$sdk_version harness=$harness_sdk_version bridge=$bridge_sdk_version" >&2
  exit 1
fi

echo "== 1/5 build Jcode release binaries =="
(
  cd "$JCODE_REPO"
  cargo build --release --locked --bin jcode --bin jcode-harness
)
"$JCODE_REPO/target/release/jcode" --version
"$JCODE_REPO/target/release/jcode-harness" --help >/dev/null

echo "== 2/5 pack the local Jcode SDK and current-platform runtime =="
sdk_tarball="$(cd "$JCODE_REPO/sdk/typescript" && npm pack --pack-destination "$work" --silent | tail -n 1)"
sdk_tarball="$work/$sdk_tarball"

case "$(uname -s):$(uname -m)" in
  Darwin:arm64) runtime_package=darwin-arm64 ;;
  Darwin:x86_64) runtime_package=darwin-x64 ;;
  Linux:aarch64) runtime_package=linux-arm64 ;;
  Linux:x86_64) runtime_package=linux-x64 ;;
  *)
    echo "BLOCKED: no Jcode npm runtime package for $(uname -s)/$(uname -m)" >&2
    exit 1
    ;;
esac
runtime_stage="$work/runtime-stage"
mkdir -p "$runtime_stage/bin"
cp "$JCODE_REPO/sdk/npm/$runtime_package/package.json" "$runtime_stage/"
cp "$JCODE_REPO/sdk/npm/$runtime_package/README.md" "$runtime_stage/"
cp "$JCODE_REPO/target/release/jcode" "$runtime_stage/bin/jcode"
chmod +x "$runtime_stage/bin/jcode"
runtime_tarball="$(cd "$runtime_stage" && npm pack --pack-destination "$work" --silent | tail -n 1)"
runtime_tarball="$work/$runtime_tarball"

echo "== 3/5 build and pack @ai-sdk/harness-jcode =="
(
  cd "$package_dir"
  ./node_modules/.bin/tsup --tsconfig tsconfig.build.json
  cp src/bridge/package.json src/bridge/pnpm-lock.yaml src/bridge/pnpm-workspace.yaml dist/bridge/
)
harness_stage="$work/harness-stage"
mkdir -p "$harness_stage"
cp -R "$package_dir/dist" "$package_dir/src" "$package_dir/README.md" "$package_dir/package.json" "$harness_stage/"
node - "$harness_stage/package.json" "$AI_REPO" <<'JS'
const [manifestPath, repo] = process.argv.slice(2);
const fs = require('node:fs');
const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
manifest.dependencies['@ai-sdk/harness'] = require(`${repo}/packages/harness/package.json`).version;
manifest.dependencies['@ai-sdk/provider-utils'] = require(`${repo}/packages/provider-utils/package.json`).version;
delete manifest.scripts;
delete manifest.devDependencies;
fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
JS
harness_tarball_name="$(cd "$harness_stage" && npm pack --pack-destination "$work" --silent | tail -n 1)"
harness_tarball="$work/$harness_tarball_name"
[[ -n "$harness_tarball" ]] || {
  echo "BLOCKED: pnpm pack did not produce an @ai-sdk/harness-jcode tarball" >&2
  exit 1
}

echo "== 4/5 install tarballs into a clean consumer =="
consumer="$work/consumer"
mkdir -p "$consumer"
cd "$consumer"
printf '{"name":"harness-jcode-release-consumer","private":true,"type":"module"}\n' > package.json
npm install --silent "$runtime_tarball" "$sdk_tarball" "$harness_tarball" zod@3.25.76
node --input-type=module <<'JS'
import { createJcode } from '@ai-sdk/harness-jcode';
import { JcodeClient, bundledJcodeBinary } from '@1jehuang/jcode-sdk';
import { access } from 'node:fs/promises';

const binary = bundledJcodeBinary();
if (!binary) throw new Error('the packed Jcode SDK did not resolve a runtime');
await access(binary);
const harness = createJcode({ experimentalHostExecution: true, binary });
if (harness.specificationVersion !== 'harness-v1') {
  throw new Error(`unexpected specification version: ${harness.specificationVersion}`);
}
const bootstrap = await harness.getBootstrap?.();
if (!bootstrap) throw new Error('Jcode bootstrap is missing');
for (const required of ['package.json', 'pnpm-lock.yaml', 'pnpm-workspace.yaml', 'bridge.mjs']) {
  if (!bootstrap.files.some(file => file.path.endsWith(`/${required}`))) {
    throw new Error(`bootstrap is missing ${required}`);
  }
}
const client = await JcodeClient.launch({ binary, inheritLogins: false });
try {
  if (!client.capabilities.includes('external_tools_v1')) {
    throw new Error('packed runtime did not advertise external_tools_v1');
  }
  const session = await client.createSession(process.cwd());
  await client.setExternalTools(session.session_id, [{
    name: 'release_probe',
    description: 'release validation probe',
    input_schema: { type: 'object' },
  }]);
  await client.setExternalTools(session.session_id, []);
  console.log(`consumer runtime ok; runtime=${binary}; capability=external_tools_v1; bootstrapFiles=${bootstrap.files.length}`);
} finally {
  await client.close();
}
JS

echo "== 5/5 optional real Vercel Sandbox probe =="
if [[ "$RUN_VERCEL_SANDBOX" == 0 ]]; then
  echo "skipped: RUN_VERCEL_SANDBOX=0"
elif [[ -z "${VERCEL_OIDC_TOKEN:-}" ]]; then
  if [[ "$RUN_VERCEL_SANDBOX" == 1 ]]; then
    echo "BLOCKED: RUN_VERCEL_SANDBOX=1 but VERCEL_OIDC_TOKEN is unset" >&2
    exit 1
  fi
  echo "skipped: VERCEL_OIDC_TOKEN is unset"
else
  if ! grep -q "@1jehuang/jcode-sdk@$sdk_version" "$package_dir/src/bridge/pnpm-lock.yaml"; then
    echo "BLOCKED: bridge lockfile does not resolve @1jehuang/jcode-sdk@$sdk_version; publish the SDK and regenerate the lockfile first" >&2
    exit 1
  fi
  npm install --silent @vercel/sandbox@^3.0.0
  node --input-type=module <<'JS'
import { createJcode } from '@ai-sdk/harness-jcode';
import { Sandbox } from '@vercel/sandbox';

const sandbox = await Sandbox.create({ runtime: 'node24', timeout: 10 * 60 * 1000 });
try {
  const bootstrap = await createJcode().getBootstrap?.();
  if (!bootstrap) throw new Error('Jcode bootstrap is missing');
  const root = '/vercel/sandbox';
  await sandbox.writeFiles(
    bootstrap.files.map(file => ({
      path: `${root}/${file.path}`,
      content: Buffer.from(file.content),
    })),
  );
  for (const step of bootstrap.commands) {
    const command = await sandbox.runCommand({
      cmd: 'bash',
      args: ['-lc', step.command],
      cwd: `${root}/${bootstrap.bootstrapDir}`,
    });
    const result = await command.wait();
    if (result.exitCode !== 0) {
      throw new Error(`sandbox bootstrap failed (${result.exitCode}): ${step.command}`);
    }
  }
  console.log('real Vercel Sandbox bootstrap ok');
} finally {
  await sandbox.stop().catch(() => {});
}
JS
fi

echo "release validation passed"
echo "artifacts: $sdk_tarball $runtime_tarball $harness_tarball"
