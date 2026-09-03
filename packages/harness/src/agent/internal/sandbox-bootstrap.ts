import { posix } from 'node:path';
import type { Experimental_SandboxSession as SandboxSession } from '@ai-sdk/provider-utils';
import type { HarnessV1Bootstrap } from '../../v1';
import { resolveSandboxDefaultWorkingDirectory } from '../../utils/resolve-sandbox-default-working-directory';
import type { HarnessAgentSandboxConfig } from '../harness-agent-settings';
import { applyBootstrapRecipe, hashHarnessBootstrap } from './bootstrap-recipe';

const SANDBOX_BOOTSTRAP_IDENTITY_VERSION = 1;

type SandboxBootstrapSettings = Omit<HarnessAgentSandboxConfig, 'onSession'>;

export type SandboxBootstrapPlan = {
  readonly recipe?: HarnessV1Bootstrap;
  readonly recipeIdentity?: string;
  readonly identity?: string;
  readonly workDir?: string;
  readonly onFirstCreate?: (
    session: SandboxSession,
    opts: { abortSignal?: AbortSignal },
  ) => Promise<void>;
};

export function validateSandboxBootstrapSettings(
  settings: SandboxBootstrapSettings,
): void {
  if ((settings.onBootstrap == null) !== (settings.bootstrapHash == null)) {
    throw new Error(
      'HarnessAgent: `sandboxConfig.onBootstrap` and `sandboxConfig.bootstrapHash` must be provided together.',
    );
  }

  if (settings.workDir != null) {
    normalizeSandboxWorkDir(settings.workDir);
  }
}

export function normalizeSandboxWorkDir(workDir: string): string {
  if (workDir.length === 0) {
    throw new Error('HarnessAgent: `sandboxConfig.workDir` must not be empty.');
  }
  if (workDir.includes('\0')) {
    throw new Error(
      'HarnessAgent: `sandboxConfig.workDir` must not contain NUL.',
    );
  }
  if (workDir.includes('\\')) {
    throw new Error(
      'HarnessAgent: `sandboxConfig.workDir` must use POSIX path separators.',
    );
  }
  if (posix.isAbsolute(workDir)) {
    throw new Error('HarnessAgent: `sandboxConfig.workDir` must be relative.');
  }

  const normalized = posix.normalize(workDir);
  if (
    normalized === '.' ||
    normalized === '..' ||
    normalized.startsWith('../')
  ) {
    throw new Error(
      'HarnessAgent: `sandboxConfig.workDir` must stay inside the sandbox default working directory.',
    );
  }
  return normalized;
}

/**
 * Where the harness runs for this session.
 *
 * Normally a per-session subdirectory of the sandbox's default working
 * directory, since a hosted sandbox is freshly provisioned and that directory
 * is not itself a workspace.
 *
 * `workspaceIsSessionWorkDir` is for workspace mode, whose root *is* the
 * user's project: a per-session subdirectory there would run the harness in
 * an empty folder beside their files. An explicit `workDir` still wins.
 */
export function resolveSessionWorkDir({
  defaultWorkingDirectory,
  harnessId,
  sessionId,
  workDir,
  workspaceIsSessionWorkDir = false,
}: {
  readonly defaultWorkingDirectory: string;
  readonly harnessId: string;
  readonly sessionId: string;
  readonly workDir?: string;
  readonly workspaceIsSessionWorkDir?: boolean;
}): string {
  if (workDir == null && workspaceIsSessionWorkDir) {
    return defaultWorkingDirectory;
  }
  return joinSandboxPath({
    base: defaultWorkingDirectory,
    path: workDir ?? `${harnessId}-${sessionId}`,
  });
}

export async function createSandboxBootstrapPlan({
  recipe,
  settings,
}: {
  readonly recipe?: HarnessV1Bootstrap;
  readonly settings: SandboxBootstrapSettings;
}): Promise<SandboxBootstrapPlan> {
  const workDir =
    settings.workDir == null
      ? undefined
      : normalizeSandboxWorkDir(settings.workDir);
  const recipeIdentity =
    recipe == null ? undefined : await hashHarnessBootstrap(recipe);
  const hasCallerBootstrap = settings.onBootstrap != null;
  const needsCombinedIdentity =
    hasCallerBootstrap || (recipeIdentity != null && workDir != null);
  const identity =
    needsCombinedIdentity && (recipeIdentity != null || hasCallerBootstrap)
      ? await hashSandboxBootstrapIdentity({
          recipeIdentity,
          bootstrapHash: settings.bootstrapHash,
          workDir,
        })
      : recipeIdentity;

  return {
    ...(recipe != null ? { recipe } : {}),
    ...(recipeIdentity != null ? { recipeIdentity } : {}),
    ...(identity != null ? { identity } : {}),
    ...(workDir != null ? { workDir } : {}),
    ...(recipe != null || settings.onBootstrap != null
      ? {
          onFirstCreate: (session, opts) =>
            runSandboxBootstrap({
              session,
              recipe,
              recipeIdentity,
              workDir,
              onBootstrap: settings.onBootstrap,
              abortSignal: opts.abortSignal,
            }),
        }
      : {}),
  };
}

export async function runSandboxBootstrap({
  session,
  recipe,
  recipeIdentity,
  workDir,
  onBootstrap,
  defaultWorkingDirectory,
  abortSignal,
}: {
  readonly session: SandboxSession;
  readonly recipe?: HarnessV1Bootstrap;
  readonly recipeIdentity?: string;
  readonly workDir?: string;
  readonly onBootstrap?: SandboxBootstrapSettings['onBootstrap'];
  readonly defaultWorkingDirectory?: string;
  readonly abortSignal?: AbortSignal;
}): Promise<void> {
  if (recipe == null && onBootstrap == null) return;

  const resolvedDefaultWorkingDirectory =
    defaultWorkingDirectory ??
    (await resolveSandboxDefaultWorkingDirectory({
      sandboxSession: session,
      abortSignal,
    }));

  if (recipe != null && recipeIdentity != null) {
    await applyBootstrapRecipe({
      session,
      recipe,
      identity: recipeIdentity,
      defaultWorkingDirectory: resolvedDefaultWorkingDirectory,
      abortSignal,
    });
  }

  if (onBootstrap == null) return;

  const bootstrapWorkDir =
    workDir == null
      ? resolvedDefaultWorkingDirectory
      : joinSandboxPath({
          base: resolvedDefaultWorkingDirectory,
          path: workDir,
        });

  await ensureSandboxDirectory({
    session,
    workDir: bootstrapWorkDir,
    abortSignal,
  });
  await onBootstrap({ session, workDir: bootstrapWorkDir, abortSignal });
}

export async function ensureSandboxDirectory({
  session,
  workDir,
  abortSignal,
}: {
  readonly session: SandboxSession;
  readonly workDir: string;
  readonly abortSignal?: AbortSignal;
}): Promise<void> {
  const result = await session.run({
    command: 'mkdir -p "$WORK_DIR"',
    env: { WORK_DIR: workDir },
    abortSignal,
  });
  if (result.exitCode !== 0) {
    throw new Error(
      `Failed to create sandbox work directory ${workDir} (exit ${result.exitCode}): ${result.stderr || result.stdout}`,
    );
  }
}

async function hashSandboxBootstrapIdentity({
  recipeIdentity,
  bootstrapHash,
  workDir,
}: {
  readonly recipeIdentity?: string;
  readonly bootstrapHash?: string;
  readonly workDir?: string;
}): Promise<string> {
  const encoder = new TextEncoder();
  const chunks: Uint8Array[] = [];
  const pushString = (value: string) => {
    chunks.push(encoder.encode(value));
    chunks.push(encoder.encode('\0'));
  };

  pushString(String(SANDBOX_BOOTSTRAP_IDENTITY_VERSION));
  pushString(recipeIdentity ?? '');
  pushString(bootstrapHash ?? '');
  pushString(workDir ?? '');

  const totalLength = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const buffer = new Uint8Array(totalLength);
  let offset = 0;
  for (const chunk of chunks) {
    buffer.set(chunk, offset);
    offset += chunk.length;
  }

  const digest = await crypto.subtle.digest('SHA-256', buffer);
  const bytes = new Uint8Array(digest);
  let hex = '';
  for (let i = 0; i < 8; i++) {
    hex += bytes[i].toString(16).padStart(2, '0');
  }
  return hex;
}

function joinSandboxPath({
  base,
  path,
}: {
  readonly base: string;
  readonly path: string;
}): string {
  return posix.join(base, path);
}
