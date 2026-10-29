import type { HarnessV1Bootstrap } from '@ai-sdk/harness';
import { createReadBridgeAsset } from '@ai-sdk/harness/utils';

/*
 * Keep every asset URL literal so bundlers can emit each file separately.
 * Dynamic new URL() paths can collapse multiple assets into one resolution.
 * The lockfile is copied as `pnpm-lockfile.yaml` in `dist/` because `pnpm pack`
 * unconditionally excludes files named `pnpm-lock.yaml` at any directory depth.
 */
const readBridgeAsset = createReadBridgeAsset({
  'package.json': new URL('./bridge/package.json', import.meta.url),
  'pnpm-lock.yaml': new URL('./bridge/pnpm-lockfile.yaml', import.meta.url),
  'index.mjs': new URL('./bridge/index.mjs', import.meta.url),
});

/*
 * Bootstrap is derived state stored under `$HOME/.ai-sdk-harness`, outside
 * the agent's working directory. Snapshot-capable providers preserve its
 * installation and recipe marker there.
 */
export const DEEPAGENTS_BOOTSTRAP_DIR = '.harness-bootstrap/deepagents';

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
      {
        command: 'pnpm install --frozen-lockfile --store-dir .pnpm-store',
      },
    ],
  };
  return cachedBootstrap;
}
