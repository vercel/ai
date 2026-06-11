import type { HarnessV1SandboxProvider } from '../v1';
import type { HarnessAgentAdapter } from './harness-agent-types';
import {
  applyBootstrapRecipe,
  hashBootstrap,
} from './internal/bootstrap-recipe';

/**
 * Pre-build a harness's sandbox template without running an agent. Idempotent:
 * if the template already exists (snapshot present, or marker on a non-snapshot
 * provider), this resolves quickly.
 *
 * Use from a CI/deploy script to amortize the first-session cost so production
 * sessions always resume from snapshot. For adapters without a bootstrap
 * recipe (no `getBootstrap`) this is a no-op.
 *
 * The temporary network sandbox session created during pre-warm is stopped
 * before the function resolves; the snapshot/template state persists in the
 * provider's native storage (for Vercel: as the `currentSnapshotId` of the
 * named template sandbox).
 */
export async function prewarmHarness(options: {
  readonly harness: HarnessAgentAdapter;
  readonly sandboxProvider: HarnessV1SandboxProvider;
  readonly abortSignal?: AbortSignal;
}): Promise<void> {
  const recipe = await options.harness.getBootstrap?.({
    abortSignal: options.abortSignal,
  });
  if (recipe == null) return;

  const identity = await hashBootstrap(recipe);
  const sandboxSession = await options.sandboxProvider.createSession({
    abortSignal: options.abortSignal,
    identity,
    onFirstCreate: (session, opts) =>
      applyBootstrapRecipe(session, recipe, identity, opts),
  });

  try {
    await applyBootstrapRecipe(sandboxSession.restricted(), recipe, identity, {
      abortSignal: options.abortSignal,
    });
  } finally {
    await Promise.resolve(sandboxSession.stop()).catch(() => {});
  }
}
