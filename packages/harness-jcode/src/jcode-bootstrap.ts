import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import type { HarnessV1Bootstrap } from '@ai-sdk/harness';

export const JCODE_BOOTSTRAP_DIR = '.harness-bootstrap/jcode';

let cachedBootstrap: HarnessV1Bootstrap | undefined;

export async function getJcodeBootstrap(): Promise<HarnessV1Bootstrap> {
  if (cachedBootstrap) return cachedBootstrap;
  const [pkg, lock, workspace, bridge] = await Promise.all([
    readBridgeAsset('package.json'),
    readBridgeAsset('pnpm-lock.yaml'),
    readBridgeAsset('pnpm-workspace.yaml'),
    readBridgeAsset('index.mjs'),
  ]);
  cachedBootstrap = {
    harnessId: 'jcode',
    bootstrapDir: JCODE_BOOTSTRAP_DIR,
    files: [
      { path: `${JCODE_BOOTSTRAP_DIR}/package.json`, content: pkg },
      { path: `${JCODE_BOOTSTRAP_DIR}/pnpm-lock.yaml`, content: lock },
      {
        path: `${JCODE_BOOTSTRAP_DIR}/pnpm-workspace.yaml`,
        content: workspace,
      },
      { path: `${JCODE_BOOTSTRAP_DIR}/bridge.mjs`, content: bridge },
    ],
    commands: [
      { command: 'pnpm install --frozen-lockfile --store-dir .pnpm-store' },
      {
        command:
          'node -e "import(\'@1jehuang/jcode-sdk\').then(m => console.log(m.API_VERSION_MAJOR))"',
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
  let lastError: unknown;
  for (const url of candidates) {
    try {
      return await readFile(fileURLToPath(url), 'utf8');
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
      lastError = error;
    }
  }
  throw lastError ?? new Error(`Jcode bridge asset not found: ${name}`);
}
