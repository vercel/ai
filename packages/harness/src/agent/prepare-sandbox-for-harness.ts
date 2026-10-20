import type { Experimental_SandboxSession as SandboxSession } from '@ai-sdk/provider-utils';
import { harnessStateDirectoryPath } from '../v1';
import type { HarnessAgentSandboxConfig } from './harness-agent-settings';
import type { HarnessAgentAdapter } from './harness-agent-types';
import { resolveSandboxDefaultWorkingDirectory } from '../utils/resolve-sandbox-default-working-directory';
import { resolveSandboxHomeDir } from '../utils/sandbox-home-dir';
import {
  applyBootstrapRecipe,
  hashHarnessBootstrap,
} from './internal/bootstrap-recipe';
import {
  normalizeSandboxWorkDir,
  runSandboxBootstrap,
  validateSandboxBootstrapSettings,
} from './internal/sandbox-bootstrap';
import { resolvePreparedSandboxIdentity } from './internal/prepared-sandbox-identity';

/** @deprecated Use `createHarnessSandboxTemplate` and `template.prepare` instead. */
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
 * @deprecated Use `createHarnessSandboxTemplate` and `template.prepare` instead.
 */
export async function prepareSandboxForHarness(options: {
  readonly session: SandboxSession;
  readonly harnesses: ReadonlyArray<HarnessAgentAdapter>;
  readonly sandboxConfig?: HarnessAgentSandboxConfig;
  readonly abortSignal?: AbortSignal;
}): Promise<PrepareSandboxForHarnessResult> {
  console.warn(
    'prepareSandboxForHarness is deprecated. Use createHarnessSandboxTemplate and template.prepare instead.',
  );
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
  let stateDirectory: string | undefined;

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
    // Harness infrastructure always lives under the sandbox's own HOME,
    // never the working directory.
    stateDirectory ??= harnessStateDirectoryPath({
      sandboxHomeDir: await resolveSandboxHomeDir({
        sandbox: options.session,
        abortSignal: options.abortSignal,
      }),
    });
    await applyBootstrapRecipe({
      session: options.session,
      recipe,
      identity: recipeIdentity,
      stateDirectory,
      abortSignal: options.abortSignal,
    });
  }

  if (sandboxConfig.onBootstrap != null) {
    const defaultWorkingDirectory = await resolveSandboxDefaultWorkingDirectory(
      { sandboxSession: options.session, abortSignal: options.abortSignal },
    );
    await runSandboxBootstrap({
      session: options.session,
      workDir,
      onBootstrap: sandboxConfig.onBootstrap,
      bootstrapHash: sandboxConfig.bootstrapHash,
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
