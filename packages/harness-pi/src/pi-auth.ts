import type {
  AuthStorage,
  ModelRegistry,
} from '@earendil-works/pi-coding-agent';

type ProviderConfigInput = Parameters<ModelRegistry['registerProvider']>[1];

/**
 * Pi auth options. Exactly one of `gateway` or `customEnv` is honoured
 * (precedence: explicit `customEnv`, then explicit `gateway`, then ambient
 * gateway from `process.env`). To use multiple providers, use `customEnv`
 * with the standard `<PREFIX>_API_KEY` / `<PREFIX>_BASE_URL` pattern.
 */
export type PiAuthOptions = {
  readonly gateway?: {
    readonly apiKey?: string;
    readonly baseUrl?: string;
  };
  /**
   * Resolved environment-variable pairs of the form `<PREFIX>_API_KEY` and
   * (optionally) `<PREFIX>_BASE_URL`. Special-cased prefixes:
   *  - `AI_GATEWAY` → registers `vercel-ai-gateway`
   *  - `OPENAI`     → registers `openai`
   *  - `ANTHROPIC`  → registers `anthropic` (`ANTHROPIC_AUTH_TOKEN` adds a
   *                   bearer auth header)
   * Any other `<PREFIX>_API_KEY` with a matching `<PREFIX>_BASE_URL` is
   * registered as the lowercased, dash-separated prefix.
   */
  readonly customEnv?: Record<string, string>;
};

/**
 * Env subset returned by `resolvePiAuth` for use by the Pi model resolver
 * (it reads `AI_GATEWAY_API_KEY` / `VERCEL_OIDC_TOKEN` to decide whether
 * to fall back to the default gateway model).
 */
export type PiResolverEnv = Record<string, string>;

const DEFAULT_GATEWAY_BASE_URL = 'https://ai-gateway.vercel.sh';
const DEFAULT_OPENAI_BASE_URL = 'https://api.openai.com/v1';
const DEFAULT_ANTHROPIC_BASE_URL = 'https://api.anthropic.com';

function register(
  registries: { authStorage: AuthStorage; modelRegistry: ModelRegistry },
  provider: string,
  apiKey: string,
  config: ProviderConfigInput,
): void {
  registries.authStorage.setRuntimeApiKey(provider, apiKey);
  registries.modelRegistry.registerProvider(provider, config);
}

function hasConfiguredValue(value: unknown): boolean {
  if (value == null) return false;
  if (typeof value === 'string') return value.length > 0;
  if (typeof value !== 'object') return true;
  return Object.values(value).some(hasConfiguredValue);
}

export function resolvePiAuth(
  options: PiAuthOptions | undefined,
  env: NodeJS.ProcessEnv,
  registries: { authStorage: AuthStorage; modelRegistry: ModelRegistry },
): PiResolverEnv {
  const customEnvConfigured = hasConfiguredValue(options?.customEnv);
  const gatewayConfigured = hasConfiguredValue(options?.gateway);

  if (customEnvConfigured) {
    return applyCustomEnv(options!.customEnv ?? {}, registries);
  }

  if (gatewayConfigured) {
    const apiKey = options!.gateway?.apiKey;
    const baseUrl = options!.gateway?.baseUrl ?? DEFAULT_GATEWAY_BASE_URL;
    if (apiKey) {
      register(registries, 'vercel-ai-gateway', apiKey, {
        apiKey,
        baseUrl,
        authHeader: true,
      });
      return { AI_GATEWAY_API_KEY: apiKey, AI_GATEWAY_BASE_URL: baseUrl };
    }
    return {};
  }

  // Ambient gateway fallback.
  const ambientKey = env.AI_GATEWAY_API_KEY || env.VERCEL_OIDC_TOKEN;
  if (ambientKey) {
    const baseUrl = env.AI_GATEWAY_BASE_URL ?? DEFAULT_GATEWAY_BASE_URL;
    register(registries, 'vercel-ai-gateway', ambientKey, {
      apiKey: ambientKey,
      baseUrl,
      authHeader: true,
    });
    return { AI_GATEWAY_API_KEY: ambientKey, AI_GATEWAY_BASE_URL: baseUrl };
  }

  return {};
}

function applyCustomEnv(
  customEnv: Record<string, string>,
  registries: { authStorage: AuthStorage; modelRegistry: ModelRegistry },
): PiResolverEnv {
  const out: PiResolverEnv = {};

  const gatewayKey = customEnv.AI_GATEWAY_API_KEY;
  if (gatewayKey) {
    const baseUrl = customEnv.AI_GATEWAY_BASE_URL ?? DEFAULT_GATEWAY_BASE_URL;
    register(registries, 'vercel-ai-gateway', gatewayKey, {
      apiKey: gatewayKey,
      baseUrl,
      authHeader: true,
    });
    out.AI_GATEWAY_API_KEY = gatewayKey;
    out.AI_GATEWAY_BASE_URL = baseUrl;
  }

  if (customEnv.OPENAI_API_KEY) {
    const baseUrl = customEnv.OPENAI_BASE_URL ?? DEFAULT_OPENAI_BASE_URL;
    register(registries, 'openai', customEnv.OPENAI_API_KEY, {
      apiKey: customEnv.OPENAI_API_KEY,
      baseUrl,
      authHeader: true,
    });
  }

  if (customEnv.ANTHROPIC_API_KEY) {
    const baseUrl = customEnv.ANTHROPIC_BASE_URL ?? DEFAULT_ANTHROPIC_BASE_URL;
    register(registries, 'anthropic', customEnv.ANTHROPIC_API_KEY, {
      apiKey: customEnv.ANTHROPIC_API_KEY,
      baseUrl,
      ...(customEnv.ANTHROPIC_AUTH_TOKEN
        ? {
            headers: {
              authorization: `Bearer ${customEnv.ANTHROPIC_AUTH_TOKEN}`,
            },
          }
        : {}),
    });
  }

  for (const [name, apiKey] of Object.entries(customEnv)) {
    if (!name.endsWith('_API_KEY') || !apiKey) {
      continue;
    }
    const prefix = name.slice(0, -'_API_KEY'.length);
    if (
      prefix === 'AI_GATEWAY' ||
      prefix === 'OPENAI' ||
      prefix === 'ANTHROPIC'
    ) {
      continue;
    }
    const provider = prefix.toLowerCase().replace(/_/g, '-');
    const baseUrl = customEnv[`${prefix}_BASE_URL`];
    if (!baseUrl) {
      continue;
    }
    register(registries, provider, apiKey, {
      apiKey,
      baseUrl,
      authHeader: true,
    });
  }

  return out;
}
