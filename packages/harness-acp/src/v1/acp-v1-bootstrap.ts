import type { HarnessV1Bootstrap } from '@ai-sdk/harness';
import { createReadBridgeAsset } from '@ai-sdk/harness/utils';
import {
  createImplementationDescriptor,
  createImplementationInstallCommand,
  createImplementationManifest,
  getImplementationInstallScript,
  getImplementationLockfile,
  getImplementationWorkspaceFile,
  type ACPImplementation,
} from './implementation';

/*
 * Keep every asset URL literal so bundlers can emit each file separately.
 * Dynamic new URL() paths can collapse multiple assets into one resolution.
 */
const readBridgeAsset = createReadBridgeAsset({
  'package.json': new URL('./bridge/package.json', import.meta.url),
  'pnpm-lock.yaml': new URL('./bridge/pnpm-lock.yaml', import.meta.url),
  'index.mjs': new URL('./bridge/index.mjs', import.meta.url),
  'host-tool-mcp.mjs': new URL('./bridge/host-tool-mcp.mjs', import.meta.url),
});

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
          readBridgeAsset('package.json'),
          readBridgeAsset('pnpm-lock.yaml'),
          readBridgeAsset('index.mjs'),
          readBridgeAsset('host-tool-mcp.mjs'),
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
