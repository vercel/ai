import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import type { HarnessV1Bootstrap } from '@ai-sdk/harness';

export const OPENCODE_BOOTSTRAP_DIR = '.harness-bootstrap/opencode';

let cachedBootstrap: HarnessV1Bootstrap | undefined;

export async function getOpenCodeBootstrap(): Promise<HarnessV1Bootstrap> {
  if (cachedBootstrap != null) return cachedBootstrap;
  const [pkg, lock, bridge, hostToolMcp] = await Promise.all([
    readBridgeAsset('package.json'),
    readBridgeAsset('pnpm-lock.yaml'),
    readBridgeAsset('index.mjs'),
    readBridgeAsset('host-tool-mcp.mjs'),
  ]);
  cachedBootstrap = {
    harnessId: 'opencode',
    bootstrapDir: OPENCODE_BOOTSTRAP_DIR,
    files: [
      { path: `${OPENCODE_BOOTSTRAP_DIR}/package.json`, content: pkg },
      { path: `${OPENCODE_BOOTSTRAP_DIR}/pnpm-lock.yaml`, content: lock },
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
        command:
          'node node_modules/opencode-ai/postinstall.mjs && ./node_modules/.bin/opencode --version',
      },
    ],
  };
  return cachedBootstrap;
}

async function readBridgeAsset(name: string): Promise<string> {
  const candidates = [
    new URL(`./bridge/${name}`, import.meta.url),
    new URL(`../bridge/${name}`, import.meta.url),
  ];
  let lastErr: unknown;
  for (const url of candidates) {
    try {
      return await readFile(fileURLToPath(url), 'utf8');
    } catch (err) {
      const code = (err as NodeJS.ErrnoException).code;
      if (code !== 'ENOENT') throw err;
      lastErr = err;
    }
  }
  throw lastErr ?? new Error(`bridge asset not found: ${name}`);
}
