import type {
  HarnessAgentAdapter,
  HarnessSandboxTemplate,
} from './harness-agent-types';
import type { HarnessAgentSandboxConfig } from './harness-agent-settings';
import { hashHarnessBootstrap } from './internal/bootstrap-recipe';
import { resolvePreparedSandboxIdentity } from './internal/prepared-sandbox-identity';
import {
  normalizeSandboxWorkDir,
  runSandboxBootstrap,
  validateSandboxBootstrapSettings,
} from './internal/sandbox-bootstrap';

export async function createHarnessSandboxTemplate(options: {
  readonly harnesses: ReadonlyArray<HarnessAgentAdapter>;
  readonly sandboxConfig?: Omit<HarnessAgentSandboxConfig, 'onSession'>;
}): Promise<HarnessSandboxTemplate | undefined> {
  if (options.harnesses.length === 0) {
    throw new Error(
      'createHarnessSandboxTemplate: at least one harness must be provided.',
    );
  }
  const settings = options.sandboxConfig ?? {};
  validateSandboxBootstrapSettings(settings);
  const workDir =
    settings.workDir == null
      ? undefined
      : normalizeSandboxWorkDir(settings.workDir);
  const harnesses = [
    ...new Map(
      options.harnesses.map(harness => [harness.harnessId, harness]),
    ).values(),
  ].sort((a, b) => a.harnessId.localeCompare(b.harnessId));
  const recipes = await Promise.all(
    harnesses.map(async harness => {
      const recipe = await harness.getBootstrap?.({});
      return recipe == null
        ? undefined
        : {
            recipe,
            identity: await hashHarnessBootstrap(recipe),
          };
    }),
  );
  const recipeIdentities: Record<string, string> = {};
  for (let index = 0; index < harnesses.length; index++) {
    const entry = recipes[index];
    if (entry != null)
      recipeIdentities[harnesses[index].harnessId] = entry.identity;
  }
  const identity = await resolvePreparedSandboxIdentity({
    recipeIdentities,
    bootstrapHash: settings.bootstrapHash,
    workDir,
  });
  if (identity == null) return undefined;
  return {
    identity,
    prepare: async ({ session, abortSignal }) => {
      for (const entry of recipes) {
        if (entry != null) {
          await runSandboxBootstrap({
            session,
            recipe: entry.recipe,
            recipeIdentity: entry.identity,
            abortSignal,
          });
        }
      }
      await runSandboxBootstrap({
        session,
        workDir,
        onBootstrap: settings.onBootstrap,
        bootstrapHash: settings.bootstrapHash,
        skipOnBootstrapIfMarked: true,
        abortSignal,
      });
    },
  };
}
