import type { HarnessV1Bootstrap } from '@ai-sdk/harness';
import { createReadBridgeAsset } from '@ai-sdk/harness/utils';

/*
 * Keep every asset URL literal so bundlers can emit each file separately.
 * Dynamic new URL() paths can collapse multiple assets into one resolution.
 */
const readBridgeAsset = createReadBridgeAsset({
  'package.json': new URL('./bridge/package.json', import.meta.url),
  'pnpm-lock.yaml': new URL('./bridge/pnpm-lock.yaml', import.meta.url),
  'pnpm-workspace.yaml': new URL(
    './bridge/pnpm-workspace.yaml',
    import.meta.url,
  ),
  'index.mjs': new URL('./bridge/index.mjs', import.meta.url),
});

/*
 * Bootstrap is derived state stored under `$HOME/.ai-sdk-harness`, outside
 * the agent's working directory. Snapshot-capable providers preserve the
 * installed CLI, bridge, and recipe marker there.
 *
 * The session work dir (`startOpts.sessionWorkDir`) lives under the sandbox's
 * default working directory, while the bridge-state dir lives under
 * `$HOME/.ai-sdk-harness/.agent-runs`. Claude's project history is keyed by
 * the working directory, so the same work dir is needed across resumes.
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
