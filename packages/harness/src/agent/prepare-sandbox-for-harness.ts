import type { Experimental_SandboxSession as SandboxSession } from '@ai-sdk/provider-utils';
import type { HarnessAgentSandboxConfig } from './harness-agent-settings';
import type { HarnessAgentAdapter } from './harness-agent-types';
import { resolveSandboxDefaultWorkingDirectory } from '../utils/resolve-sandbox-default-working-directory';
import {
  applyBootstrapRecipe,
  hashHarnessBootstrap,
} from './internal/bootstrap-recipe';
import {
  normalizeSandboxWorkDir,
  runSandboxBootstrap,
  validateSandboxBootstrapSettings,
} from './internal/sandbox-bootstrap';

const PREPARED_SANDBOX_IDENTITY_VERSION = 1;

export type PrepareSandboxForHarnessResult = {
  readonly identity?: string;
  readonly recipeIdentities: Record<string, string>;
  readonly skippedHarnessIds: ReadonlyArray<string>;
};

/**
 * Apply one or more harness bootstrap recipes to an existing sandbox session.
 *
 * Use this when a sandbox provider or caller wants to prepare a reusable
 * sandbox template, image, or snapshot before creating live harness sessions.
 *
 * The function writes each adapter's bridge/bootstrap files, runs its install
 * commands, and then returns a deterministic identity derived from the applied
 * recipes and optional sandbox bootstrap configuration. Providers can use that
 * identity as the cache key for the prepared artifact.
 *
 * This function only mutates the supplied sandbox; the caller is responsible for
 * committing, snapshotting, or otherwise persisting that modified filesystem.
 * When a later `HarnessAgent` session uses a sandbox created from the persisted
 * artifact, the adapter recomputes the same recipe identity and the existing
 * bootstrap marker makes the bootstrap logic a no-op.
 *
 * Repeated harness IDs are prepared once. When multiple adapters use the same
 * ID, the last adapter in `harnesses` is used.
 */
export async function prepareSandboxForHarness(options: {
  readonly session: SandboxSession;
  readonly harnesses: ReadonlyArray<HarnessAgentAdapter>;
  readonly sandboxConfig?: HarnessAgentSandboxConfig;
  readonly abortSignal?: AbortSignal;
}): Promise<PrepareSandboxForHarnessResult> {
  const sandboxConfig = options.sandboxConfig ?? {};
  validateSandboxBootstrapSettings(sandboxConfig);

  if (options.harnesses.length === 0) {
    throw new Error(
      'prepareSandboxForHarness: at least one harness must be provided.',
    );
  }

  const harnesses = [
    ...new Map(
      options.harnesses.map(harness => [harness.harnessId, harness]),
    ).values(),
  ].sort((a, b) => a.harnessId.localeCompare(b.harnessId));

  const workDir =
    sandboxConfig.workDir == null
      ? undefined
      : normalizeSandboxWorkDir(sandboxConfig.workDir);
  const recipeIdentities: Record<string, string> = {};
  const skippedHarnessIds: string[] = [];
  let defaultWorkingDirectory: string | undefined;

  for (const harness of harnesses) {
    const recipe = await harness.getBootstrap?.({
      abortSignal: options.abortSignal,
    });
    if (recipe == null) {
      skippedHarnessIds.push(harness.harnessId);
      continue;
    }

    const recipeIdentity = await hashHarnessBootstrap(recipe);
    recipeIdentities[harness.harnessId] = recipeIdentity;
    defaultWorkingDirectory ??= await resolveSandboxDefaultWorkingDirectory({
      sandboxSession: options.session,
      abortSignal: options.abortSignal,
    });
    await applyBootstrapRecipe({
      session: options.session,
      recipe,
      identity: recipeIdentity,
      defaultWorkingDirectory,
      abortSignal: options.abortSignal,
    });
  }

  if (sandboxConfig.onBootstrap != null) {
    await runSandboxBootstrap({
      session: options.session,
      workDir,
      onBootstrap: sandboxConfig.onBootstrap,
      defaultWorkingDirectory,
      abortSignal: options.abortSignal,
    });
  }

  const identity = await resolvePreparedSandboxIdentity({
    recipeIdentities,
    bootstrapHash: sandboxConfig.bootstrapHash,
    workDir,
  });

  return {
    ...(identity != null ? { identity } : {}),
    recipeIdentities,
    skippedHarnessIds,
  };
}

async function resolvePreparedSandboxIdentity({
  recipeIdentities,
  bootstrapHash,
  workDir,
}: {
  readonly recipeIdentities: Record<string, string>;
  readonly bootstrapHash?: string;
  readonly workDir?: string;
}): Promise<string | undefined> {
  const entries = Object.entries(recipeIdentities).sort(([a], [b]) =>
    a.localeCompare(b),
  );
  if (entries.length === 0 && bootstrapHash == null) {
    return undefined;
  }

  const encoder = new TextEncoder();
  const chunks: Uint8Array[] = [];
  const pushString = (value: string) => {
    chunks.push(encoder.encode(value));
    chunks.push(encoder.encode('\0'));
  };

  pushString(String(PREPARED_SANDBOX_IDENTITY_VERSION));
  pushString(workDir ?? '');
  pushString(bootstrapHash ?? '');

  for (const [harnessId, identity] of entries) {
    pushString(harnessId);
    pushString(identity);
  }

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
