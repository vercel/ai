import type { HarnessV1Bootstrap } from '@ai-sdk/harness';
import { createReadBridgeAsset } from '@ai-sdk/harness/utils';

const readBridgeAsset = createReadBridgeAsset({
  resolveAssetUrl: name => new URL(`./bridge/${name}`, import.meta.url),
});

export const OPENCODE_BOOTSTRAP_DIR = '.harness-bootstrap/opencode';

let cachedBootstrap: HarnessV1Bootstrap | undefined;

export async function getOpenCodeBootstrap(): Promise<HarnessV1Bootstrap> {
  if (cachedBootstrap != null) return cachedBootstrap;
  const [pkg, lock, workspace, bridge, hostToolMcp] = await Promise.all([
    readBridgeAsset('package.json'),
    readBridgeAsset('pnpm-lock.yaml'),
    readBridgeAsset('pnpm-workspace.yaml'),
    readBridgeAsset('index.mjs'),
    readBridgeAsset('host-tool-mcp.mjs'),
  ]);
  cachedBootstrap = {
    harnessId: 'opencode',
    bootstrapDir: OPENCODE_BOOTSTRAP_DIR,
    files: [
      { path: `${OPENCODE_BOOTSTRAP_DIR}/package.json`, content: pkg },
      { path: `${OPENCODE_BOOTSTRAP_DIR}/pnpm-lock.yaml`, content: lock },
      {
        path: `${OPENCODE_BOOTSTRAP_DIR}/pnpm-workspace.yaml`,
        content: workspace,
      },
      { path: `${OPENCODE_BOOTSTRAP_DIR}/bridge.mjs`, content: bridge },
      {
        path: `${OPENCODE_BOOTSTRAP_DIR}/host-tool-mcp.mjs`,
        content: hostToolMcp,
      },
    ],
    commands: [
      {
        command: 'pnpm install --frozen-lockfile --store-dir .pnpm-store',
      },
      {
        command: './node_modules/.bin/opencode --version',
      },
    ],
  };
  return cachedBootstrap;
}
