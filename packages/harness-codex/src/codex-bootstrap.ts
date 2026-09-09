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
 * The session work dir (`startOpts.sessionWorkDir`) lives under the sandbox's
 * default working directory — the provider's persistent mount — so any files
 * the agent edits survive both detach -> attach and stop -> snapshot -> resume
 * cycles. Harness infra derived from `sandboxSession.defaultWorkingDirectory`
 * lives under `.agent-runs`, outside the agent workdir.
 */
export const CODEX_BOOTSTRAP_DIR = '.harness-bootstrap/codex';

let cachedBootstrap: HarnessV1Bootstrap | undefined;

export async function getCodexBootstrap(): Promise<HarnessV1Bootstrap> {
  if (cachedBootstrap != null) return cachedBootstrap;
  const [pkg, lock, bridge] = await Promise.all([
    readBridgeAsset('package.json'),
    readBridgeAsset('pnpm-lock.yaml'),
    readBridgeAsset('index.mjs'),
  ]);
  cachedBootstrap = {
    harnessId: 'codex',
    bootstrapDir: CODEX_BOOTSTRAP_DIR,
    files: [
      { path: `${CODEX_BOOTSTRAP_DIR}/package.json`, content: pkg },
      { path: `${CODEX_BOOTSTRAP_DIR}/pnpm-lock.yaml`, content: lock },
      { path: `${CODEX_BOOTSTRAP_DIR}/bridge.mjs`, content: bridge },
    ],
    commands: [
      {
        command: 'pnpm install --frozen-lockfile --store-dir .pnpm-store',
      },
    ],
  };
  return cachedBootstrap;
}
