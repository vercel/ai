import type { HarnessV1Bootstrap } from '@ai-sdk/harness';
import { createReadBridgeAsset } from '@ai-sdk/harness/utils';

const readBridgeAsset = createReadBridgeAsset({
  resolveAssetUrl: name => new URL(`./bridge/${name}`, import.meta.url),
});

/*
 * Bootstrap is derived state stored under the sandbox's default working
 * directory so snapshot-capable providers can preserve the installed CLI,
 * bridge, and recipe marker without requiring root filesystem access.
 *
 * The session work dir (`startOpts.sessionWorkDir`) and the bridge-state dir
 * derived from `sandboxSession.defaultWorkingDirectory` both live under the sandbox's
 * default working directory — the provider's persistent mount — so the
 * workdir's CLI state (Claude's `~/.claude/projects/<dir>/*.jsonl` thread
 * history is keyed by working directory) and the bridge state files survive
 * both detach -> attach/replay and stop -> snapshot -> resume cycles.
 */
export const CLAUDE_CODE_BOOTSTRAP_DIR = '.harness-bootstrap/claude-code';

let cachedBootstrap: HarnessV1Bootstrap | undefined;

export async function getClaudeCodeBootstrap(): Promise<HarnessV1Bootstrap> {
  if (cachedBootstrap != null) return cachedBootstrap;
  const [pkg, lock, workspace, bridge] = await Promise.all([
    readBridgeAsset('package.json'),
    readBridgeAsset('pnpm-lock.yaml'),
    readBridgeAsset('pnpm-workspace.yaml'),
    readBridgeAsset('index.mjs'),
  ]);
  cachedBootstrap = {
    harnessId: 'claude-code',
    bootstrapDir: CLAUDE_CODE_BOOTSTRAP_DIR,
    files: [
      { path: `${CLAUDE_CODE_BOOTSTRAP_DIR}/package.json`, content: pkg },
      { path: `${CLAUDE_CODE_BOOTSTRAP_DIR}/pnpm-lock.yaml`, content: lock },
      {
        path: `${CLAUDE_CODE_BOOTSTRAP_DIR}/pnpm-workspace.yaml`,
        content: workspace,
      },
      { path: `${CLAUDE_CODE_BOOTSTRAP_DIR}/bridge.mjs`, content: bridge },
    ],
    commands: [
      {
        command: 'pnpm install --frozen-lockfile --store-dir .pnpm-store',
      },
      {
        command: './node_modules/.bin/claude --version',
      },
    ],
  };
  return cachedBootstrap;
}
