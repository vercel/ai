import type { HarnessV1Bootstrap } from '@ai-sdk/harness';
import { createReadBridgeAsset } from '@ai-sdk/harness/utils';
import type { ACPSource } from './acp-v1-settings';
import type { ACPAgentLaunch } from './bridge/acp-v1-bridge-environment';

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
  'host-tool-mcp.mjs': new URL('./bridge/host-tool-mcp.mjs', import.meta.url),
});

const PNPM_INSTALL_COMMAND =
  'pnpm install --frozen-lockfile --prod --store-dir .pnpm-store';

export function createACPBootstrap({
  harnessId,
  source,
}: {
  readonly harnessId: string;
  readonly source: ACPSource;
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
      const [bridge, hostToolMCP, installFiles] = await Promise.all([
        readBridgeAsset('index.mjs'),
        readBridgeAsset('host-tool-mcp.mjs'),
        readInstallFiles({ source }),
      ]);
      const files: Record<string, string> = {
        'bridge.mjs': bridge,
        'host-tool-mcp.mjs': hostToolMCP,
        ...installFiles,
      };
      cachedBootstrap = {
        harnessId,
        bootstrapDir,
        files: Object.entries(files).map(([name, content]) => ({
          path: `${bootstrapDir}/${name}`,
          content,
        })),
        commands: [
          { command: PNPM_INSTALL_COMMAND },
          ...(source.type === 'install-command'
            ? [{ command: 'bash install.sh' }]
            : []),
        ],
      };
      return cachedBootstrap;
    },
  };
}

export function resolveACPAgentLaunch({
  bootstrapDirectory,
  source,
  executable,
  args = [],
}: {
  readonly bootstrapDirectory: string;
  readonly source: ACPSource;
  readonly executable: string;
  readonly args?: ReadonlyArray<string>;
}): ACPAgentLaunch {
  if (source.type === 'install-command') {
    const home = `${bootstrapDirectory}/home`;
    return {
      command: `${home}/.local/bin/${executable}`,
      args: [...args],
      home,
    };
  }
  return {
    command: `${bootstrapDirectory}/node_modules/.bin/${executable}`,
    args: [...args],
  };
}

/*
 * A locked source is the complete bridge installation and therefore replaces
 * the bridge manifest. An install command source installs the agent outside
 * of pnpm, so the bridge manifest only provides the bridge's own runtime
 * dependencies.
 */
async function readInstallFiles({
  source,
}: {
  source: ACPSource;
}): Promise<Record<string, string>> {
  if (source.type === 'npm-locked') {
    return {
      'package.json': source.packageJson,
      'pnpm-lock.yaml': source.pnpmLockYaml,
      ...(source.pnpmWorkspaceYaml == null
        ? {}
        : { 'pnpm-workspace.yaml': source.pnpmWorkspaceYaml }),
    };
  }
  const [packageJson, pnpmLockYaml] = await Promise.all([
    readBridgeAsset('package.json'),
    readBridgeAsset('pnpm-lock.yaml'),
  ]);
  return {
    'package.json': packageJson,
    'pnpm-lock.yaml': pnpmLockYaml,
    'install.sh': createInstallScript({ command: source.command }),
  };
}

function createInstallScript({ command }: { command: string }): string {
  return `#!/usr/bin/env bash
set -euo pipefail

ACP_BOOTSTRAP_DIR="$(cd "$(dirname "\${BASH_SOURCE[0]}")" && pwd)"
export HOME="$ACP_BOOTSTRAP_DIR/home"
export PATH="$HOME/.local/bin:$PATH"

mkdir -p "$HOME/.local/bin"
cd "$HOME"

${command}
`;
}
