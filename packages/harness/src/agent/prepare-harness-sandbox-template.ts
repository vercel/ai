import type { HarnessV1Bootstrap, HarnessV1SandboxProvider } from '../v1';
import type { HarnessAgentAdapter } from './harness-agent-types';
import type { HarnessAgentSandboxConfig } from './harness-agent-settings';
import { applyBootstrapRecipe } from './internal/bootstrap-recipe';
import {
  createSandboxBootstrapPlan,
  validateSandboxBootstrapSettings,
} from './internal/sandbox-bootstrap';

type SandboxBootstrapSettings = Omit<HarnessAgentSandboxConfig, 'onSession'>;

/**
 * Prepare a harness's sandbox template without running an agent. Idempotent: if
 * the template already exists (snapshot present, or marker on a non-snapshot
 * provider), this resolves quickly.
 *
 * Use from a CI/deploy script to amortize the first-session cost so production
 * sessions always resume from snapshot. For adapters without a bootstrap
 * recipe (no `getBootstrap`) this is a no-op.
 *
 * The temporary network sandbox session created during preparation is stopped
 * before the function resolves; the snapshot/template state persists in the
 * provider's native storage (for Vercel: as the `currentSnapshotId` of the
 * named template sandbox).
 */
export async function prepareHarnessSandboxTemplate(options: {
  readonly harness: HarnessAgentAdapter;
  readonly sandboxProvider: HarnessV1SandboxProvider;
  readonly sandboxConfig?: SandboxBootstrapSettings;
  readonly abortSignal?: AbortSignal;
}): Promise<void> {
  const sandboxConfig = options.sandboxConfig ?? {};
  validateSandboxBootstrapSettings(sandboxConfig);

  const { harness, sandboxProvider, abortSignal } = options;

  let recipe: HarnessV1Bootstrap | undefined;
  if (harness.getBootstrap != null) {
    recipe = await harness.getBootstrap({ abortSignal });
  }

  const bootstrapPlan = await createSandboxBootstrapPlan({
    recipe,
    settings: sandboxConfig,
  });
  if (bootstrapPlan.identity == null || bootstrapPlan.onFirstCreate == null) {
    return;
  }

  const sandboxSession = await sandboxProvider.createSession({
    abortSignal,
    identity: bootstrapPlan.identity,
    onFirstCreate: bootstrapPlan.onFirstCreate,
  });

  // Unlike `prepareSandboxForHarness()` and `HarnessAgent.createSession()`, this function
  // does not apply the agent-specific sandbox config, since the function is meant as a
  // general harness utility, not for a concrete agent.
  try {
    if (bootstrapPlan.recipe != null && bootstrapPlan.recipeIdentity != null) {
      await applyBootstrapRecipe({
        session: sandboxSession.restricted(),
        recipe: bootstrapPlan.recipe,
        identity: bootstrapPlan.recipeIdentity,
        defaultWorkingDirectory: sandboxSession.defaultWorkingDirectory,
        abortSignal,
      });
    }
  } finally {
    await Promise.resolve(sandboxSession.stop()).catch(() => {});
  }
}

/** @deprecated Use `prepareHarnessSandboxTemplate` instead. */
export const prewarmHarness = prepareHarnessSandboxTemplate;
