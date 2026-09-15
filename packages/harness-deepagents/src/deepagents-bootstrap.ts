import type { HarnessV1Bootstrap } from '@ai-sdk/harness';
import { createReadBridgeAsset } from '@ai-sdk/harness/utils';

const readBridgeAsset = createReadBridgeAsset({
  resolveAssetUrl: name => new URL(`./bridge/${name}`, import.meta.url),
});

/*
 * Bootstrap is derived state stored under the sandbox's default working
 * directory so snapshot-capable providers preserve its installation and
 * recipe marker without requiring root filesystem access.
 */
export const DEEPAGENTS_BOOTSTRAP_DIR = '.harness-bootstrap/deepagents';

/*
 * Pinned ripgrep release and per-architecture tarball checksums are verified
 * before installation.
 */
const RIPGREP_VERSION = '14.1.1';
const RIPGREP_SHA256_X64 =
  '4cf9f2741e6c465ffdb7c26f38056a59e2a2544b51f7cc128ef28337eeae4d8e';
const RIPGREP_SHA256_ARM =
  'c827481c4ff4ea10c9dc7a4022c8de5db34a5737cb74484d62eb94a95841ab2f';

let cachedBootstrap: HarnessV1Bootstrap | undefined;

export async function getDeepAgentsBootstrap(): Promise<HarnessV1Bootstrap> {
  if (cachedBootstrap != null) return cachedBootstrap;
  const [bridge, pkg, lock] = await Promise.all([
    readBridgeAsset('index.mjs'),
    readBridgeAsset('package.json'),
    readBridgeAsset('pnpm-lock.yaml'),
  ]);
  cachedBootstrap = {
    harnessId: 'deepagents',
    bootstrapDir: DEEPAGENTS_BOOTSTRAP_DIR,
    files: [
      { path: `${DEEPAGENTS_BOOTSTRAP_DIR}/bridge.mjs`, content: bridge },
      { path: `${DEEPAGENTS_BOOTSTRAP_DIR}/package.json`, content: pkg },
      { path: `${DEEPAGENTS_BOOTSTRAP_DIR}/pnpm-lock.yaml`, content: lock },
    ],
    commands: [
      { command: installRipgrepCommand() },
      {
        command: 'pnpm install --frozen-lockfile --store-dir .pnpm-store',
      },
    ],
  };
  return cachedBootstrap;
}

/*
 * DeepAgents' grep shells out to `rg`. Without it, the fallback reads the
 * entire workdir, including node_modules, into memory and can run out of
 * memory. The checksum-verified installation is skipped when `rg` exists.
 */
function installRipgrepCommand(): string {
  const v = RIPGREP_VERSION;
  return [
    'command -v rg >/dev/null 2>&1 || {',
    'case "$(uname -m)" in',
    `aarch64) a=aarch64-unknown-linux-gnu; sha=${RIPGREP_SHA256_ARM} ;;`,
    `*) a=x86_64-unknown-linux-musl; sha=${RIPGREP_SHA256_X64} ;;`,
    'esac;',
    `f=/tmp/ripgrep-${v}.tar.gz;`,
    `curl -fsSL "https://github.com/BurntSushi/ripgrep/releases/download/${v}/ripgrep-${v}-$a.tar.gz" -o "$f"`,
    '&& echo "$sha  $f" | sha256sum -c -',
    '&& tar xzf "$f" -C /tmp',
    `&& mv "/tmp/ripgrep-${v}-$a/rg" /usr/local/bin/rg && chmod +x /usr/local/bin/rg;`,
    '}',
  ].join(' ');
}
