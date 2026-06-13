import type { ModelRegistry } from '@earendil-works/pi-coding-agent';

type PiModel = ReturnType<ModelRegistry['getAll']>[number];

/**
 * Default model id used when no `model` is configured AND gateway credentials
 * are available in the environment. Looked up from Pi's own model registry —
 * the entry must exist under the `vercel-ai-gateway` provider in
 * `@earendil-works/pi-ai`'s catalog.
 */
export const DEFAULT_PI_GATEWAY_MODEL_ID = 'anthropic/claude-sonnet-4.6';

export function createPiModelResolver(
  modelRegistry: ModelRegistry,
  env: NodeJS.ProcessEnv = process.env,
  /**
   * Provider ids to prefer when a model id is published under more than one
   * provider. Populated from any custom `providers` registered for the session,
   * so dispatch uses the provider whose credential the caller actually seeded.
   */
  preferredProviders: ReadonlyArray<string> = [],
) {
  let cachedModels: PiModel[] | undefined;

  const loadModels = (): PiModel[] => {
    if (cachedModels) {
      return cachedModels;
    }
    try {
      cachedModels = modelRegistry.getAll();
    } catch {
      cachedModels = [];
    }
    return cachedModels;
  };

  return (modelId: string | undefined): PiModel | undefined => {
    const useGateway = Boolean(env.AI_GATEWAY_API_KEY || env.VERCEL_OIDC_TOKEN);
    const effectiveId =
      modelId ?? (useGateway ? DEFAULT_PI_GATEWAY_MODEL_ID : undefined);
    if (!effectiveId) return undefined;

    const models = loadModels();
    const matches = (m: PiModel) =>
      m.id === effectiveId || m.name === effectiveId;

    // Pi's catalog lists the same model id under multiple providers (e.g.
    // `gpt-5.5` is published under `openai-codex`, `openai`, `openrouter`,
    // `vercel-ai-gateway`, ...). Without disambiguation Pi may dispatch through
    // a provider the caller never registered, which fails with "No API key
    // found".
    //
    // Preference order:
    //  1. An explicitly registered custom provider (see `providers`), so a
    //     caller-seeded credential is the one actually used.
    //  2. The gateway-routed entry when gateway creds are present.
    //  3. The first matching entry.
    for (const provider of preferredProviders) {
      const preferred = models.find(m => m.provider === provider && matches(m));
      if (preferred) return preferred;
    }
    return (
      (useGateway &&
        models.find(m => m.provider === 'vercel-ai-gateway' && matches(m))) ||
      models.find(matches)
    );
  };
}
