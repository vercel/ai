import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import type { HarnessV1Bootstrap } from '@ai-sdk/harness';

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

/**
 * The Claude Code CLI version this adapter's bridge (`@anthropic-ai/
 * claude-agent-sdk`) is built and tested against. The bootstrap installs no
 * CLI of its own — the adapter drives the environment's `claude`, installing
 * this version (with consent) only when the environment has none.
 */
export const CLAUDE_CODE_PINNED_CLI_VERSION = '2.1.213';

/**
 * The adapter-preferred command to install the Claude Code CLI into an
 * environment that lacks it. Declared as `HarnessV1.installation.command`;
 * run only after the host consents.
 */
export const CLAUDE_CODE_INSTALL_COMMAND = `npm install -g @anthropic-ai/claude-code@${CLAUDE_CODE_PINNED_CLI_VERSION}`;

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
        // The bridge's JavaScript dependencies only. `--no-optional` skips
        // the Agent SDK's bundled platform binaries (hundreds of megabytes of
        // CLI copies): the adapter always drives the environment's own
        // `claude`, so the bundled ones would never run. The pnpm store is a
        // build artifact nothing reads afterwards — pnpm copies rather than
        // hardlinks here, so it is a second copy of everything — but its
        // cleanup must not swallow the install's exit status: a failed
        // install recorded as a completed bootstrap leaves a half-linked
        // node_modules that every later session trusts.
        command: [
          'pnpm install --frozen-lockfile --store-dir .pnpm-store --no-optional',
          'install_status=$?',
          'rm -rf .pnpm-store',
          'exit $install_status',
        ].join('\n'),
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
