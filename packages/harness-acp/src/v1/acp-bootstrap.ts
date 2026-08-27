import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import type { HarnessV1Bootstrap } from '@ai-sdk/harness';
import {
  createImplementationDescriptor,
  createImplementationInstallCommand,
  createImplementationManifest,
  getImplementationInstallScript,
  getImplementationLockfile,
  getImplementationWorkspaceFile,
  type ACPImplementation,
} from './implementation';

export function createACPBootstrap({
  harnessId,
  implementation,
}: {
  readonly harnessId: string;
  readonly implementation: ACPImplementation;
}): {
  readonly bootstrapDir: string;
  readonly getBootstrap: () => Promise<HarnessV1Bootstrap>;
} {
  const bootstrapDir = `.harness-bootstrap/${harnessId}`;
  let cachedBootstrap: HarnessV1Bootstrap | undefined;

  return {
    bootstrapDir,
    getBootstrap: async () => {
      if (cachedBootstrap != null) return cachedBootstrap;
      const [bridgePackage, bridgeLock, bridge, hostToolMCP] =
        await Promise.all([
          readBridgeAsset({ name: 'package.json' }),
          readBridgeAsset({ name: 'pnpm-lock.yaml' }),
          readBridgeAsset({ name: 'index.mjs' }),
          readBridgeAsset({ name: 'host-tool-mcp.mjs' }),
        ]);
      const implementationManifest = createImplementationManifest({
        implementation,
      });
      const implementationLock = getImplementationLockfile({
        implementation,
      });
      const implementationWorkspace = getImplementationWorkspaceFile({
        implementation,
      });
      const implementationInstallScript = getImplementationInstallScript({
        implementation,
      });
      cachedBootstrap = {
        harnessId,
        bootstrapDir,
        files: [
          {
            path: `${bootstrapDir}/package.json`,
            content: bridgePackage,
          },
          {
            path: `${bootstrapDir}/pnpm-lock.yaml`,
            content: bridgeLock,
          },
          { path: `${bootstrapDir}/bridge.mjs`, content: bridge },
          {
            path: `${bootstrapDir}/host-tool-mcp.mjs`,
            content: hostToolMCP,
          },
          {
            path: `${bootstrapDir}/implementation/implementation.json`,
            content: createImplementationDescriptor({ implementation }),
          },
          ...(implementationManifest == null
            ? []
            : [
                {
                  path: `${bootstrapDir}/implementation/package.json`,
                  content: implementationManifest,
                },
              ]),
          ...(implementationLock == null
            ? []
            : [
                {
                  path: `${bootstrapDir}/implementation/pnpm-lock.yaml`,
                  content: implementationLock,
                },
              ]),
          ...(implementationWorkspace == null
            ? []
            : [
                {
                  path: `${bootstrapDir}/implementation/pnpm-workspace.yaml`,
                  content: implementationWorkspace,
                },
              ]),
          ...(implementationInstallScript == null
            ? []
            : [
                {
                  path: `${bootstrapDir}/implementation/install.sh`,
                  content: implementationInstallScript,
                },
              ]),
        ],
        commands: [
          {
            command: 'pnpm install --frozen-lockfile --store-dir .pnpm-store',
          },
          {
            command: createImplementationInstallCommand({
              implementationDir: 'implementation',
              storeDir: '../.pnpm-store',
              implementation,
            }),
          },
        ],
      };
      return cachedBootstrap;
    },
  };
}

async function readBridgeAsset({ name }: { name: string }): Promise<string> {
  const candidates = resolveBridgeAssetCandidates({
    name,
    moduleUrl: import.meta.url,
  });
  let lastError: unknown;
  for (const url of candidates) {
    try {
      return await readFile(fileURLToPath(url), 'utf8');
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
      lastError = error;
    }
  }
  throw lastError ?? new Error(`ACP bridge asset not found: ${name}`);
}

export function resolveBridgeAssetCandidates({
  name,
  moduleUrl,
}: {
  name: string;
  moduleUrl: string | URL;
}): URL[] {
  return [
    new URL(`./bridge/${name}`, moduleUrl),
    new URL(`../bridge/${name}`, moduleUrl),
  ];
}
