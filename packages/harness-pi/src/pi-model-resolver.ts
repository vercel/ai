import type { ModelRegistry } from '@earendil-works/pi-coding-agent';
import { getAiGatewayAuthFromEnv } from '@ai-sdk/harness/utils';

type PiModel = ReturnType<ModelRegistry['getAll']>[number];

/**
 * Default model id used when no `model` is configured AND gateway credentials
 * are available in the environment. Looked up from Pi's own model registry —
 * the entry must exist under the `vercel-ai-gateway` provider in
 * `@earendil-works/pi-ai`'s catalog.
 */
export const DEFAULT_PI_GATEWAY_MODEL_ID = 'anthropic/claude-sonnet-4.6';

export function createPiModelResolver({
  modelRegistry,
  env = process.env,
}: {
  modelRegistry: ModelRegistry;
  env?: NodeJS.ProcessEnv;
}) {
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

  // Providers registered through `auth.customEnv` contribute credentials but
  // no catalog entries, so a custom model id served by such a provider can
  // never match `getAll()`. When exactly one registered provider declares its
  // wire `api` and `baseUrl` (the generic `<PREFIX>_API_KEY` /
  // `<PREFIX>_BASE_URL` pattern), dispatch the requested id through it
  // instead of letting Pi silently fall back to its own default model.
  const synthesizeRegisteredProviderModel = (
    modelId: string,
  ): PiModel | undefined => {
    const candidates = modelRegistry
      .getRegisteredProviderIds()
      .flatMap(provider => {
        const config = modelRegistry.getRegisteredProviderConfig(provider);
        return config?.api && config.baseUrl
          ? [{ provider, api: config.api, baseUrl: config.baseUrl }]
          : [];
      });
    if (candidates.length !== 1) return undefined;
    const [{ provider, api, baseUrl }] = candidates;
    return {
      id: modelId,
      name: modelId,
      api,
      provider,
      baseUrl,
      // Mirrors Pi's own defaults for custom `models.json` model entries.
      reasoning: false,
      input: ['text'],
      cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
      contextWindow: 128_000,
      maxTokens: 16_384,
    };
  };

  return (modelId: string | undefined): PiModel | undefined => {
    const useGateway = Boolean(getAiGatewayAuthFromEnv({ env }).apiKey);
    const effectiveId =
      modelId ?? (useGateway ? DEFAULT_PI_GATEWAY_MODEL_ID : undefined);
    if (!effectiveId) return undefined;

    const models = loadModels();
    const matches = (m: PiModel) =>
      m.id === effectiveId || m.name === effectiveId;

    const registeredProviders = new Set(
      modelRegistry.getRegisteredProviderIds(),
    );

    // When gateway creds are present, prefer the gateway-routed entry for the
    // given id. Pi's catalog lists the same model id under multiple providers
    // (e.g. `anthropic/claude-sonnet-4.6` exists under both `openrouter` and
    // `vercel-ai-gateway`); without this preference Pi would dispatch through
    // a provider we didn't register, which fails with "No API key found".
    // The same applies to any other provider registered for this session
    // (e.g. `openai` via `auth.customEnv`): prefer entries whose provider was
    // actually authenticated over entries that merely share the model id.
    const resolved =
      (useGateway &&
        models.find(m => m.provider === 'vercel-ai-gateway' && matches(m))) ||
      models.find(m => registeredProviders.has(m.provider) && matches(m)) ||
      models.find(matches);
    if (resolved) return resolved;

    // Only an explicitly configured model id may target a custom provider;
    // the gateway default id never should.
    if (modelId == null) return undefined;
    return synthesizeRegisteredProviderModel(modelId);
  };
}
