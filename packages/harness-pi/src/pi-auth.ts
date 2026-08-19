import type {
  ModelRegistry,
  ModelRuntime,
} from '@earendil-works/pi-coding-agent';
import { getAiGatewayAuthFromEnv } from '@ai-sdk/harness/utils';
import { VERSION } from './version';

type ProviderConfigInput = Parameters<ModelRegistry['registerProvider']>[1];

/**
 * Pi auth options. Choose an explicit mode or rely on 'auto' (precedence:
 * explicit gateway, then OpenAI / Anthropic / custom environment variables).
 */
export type PiAuthenticationMode =
  | 'auto'
  | 'openai'
  | 'anthropic'
  | 'custom'
  | 'ai-gateway';

/**
 * @deprecated Passing an object to auth options is deprecated. Use a `PiAuthenticationMode` string value ("auto" | "openai" | "anthropic" | "custom" | "ai-gateway") instead, and pass credentials via environment variables.
 */
export type LegacyPiAuthOptions = {
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

export type PiAuthOptions = PiAuthenticationMode | LegacyPiAuthOptions;

const DEFAULT_GATEWAY_BASE_URL = 'https://ai-gateway.vercel.sh';
const DEFAULT_OPENAI_BASE_URL = 'https://api.openai.com/v1';
const DEFAULT_ANTHROPIC_BASE_URL = 'https://api.anthropic.com';
const HARNESS_CLIENT_APP = `ai-sdk/harness-pi/${VERSION}`;

function createGatewayProviderConfig({
  apiKey,
  baseUrl,
  clientApp,
}: {
  apiKey: string;
  baseUrl: string;
  clientApp: string;
}): ProviderConfigInput {
  return {
    apiKey,
    baseUrl,
    authHeader: true,
    headers: {
      'User-Agent': clientApp,
      'x-client-app': clientApp,
    },
  };
}

type PiRegistries = {
  modelRegistry: ModelRegistry;
  modelRuntime: ModelRuntime;
};

async function register({
  registries,
  provider,
  apiKey,
  config,
}: {
  registries: PiRegistries;
  provider: string;
  apiKey: string;
  config: ProviderConfigInput;
}): Promise<void> {
  registries.modelRegistry.registerProvider(provider, config);
  await registries.modelRuntime.setRuntimeApiKey(provider, apiKey);
}

function hasConfiguredValue(value: unknown): boolean {
  if (value == null) return false;
  if (typeof value === 'string') return value.length > 0;
  if (typeof value !== 'object') return true;
  return Object.values(value).some(hasConfiguredValue);
}

export function resolvePiEnv({
  options,
  env,
}: {
  options: PiAuthOptions | undefined;
  env: NodeJS.ProcessEnv;
}): Record<string, string> {
  const normalizedOptions = normalizePiAuthToLegacyAuth(options);
  const customEnvConfigured = hasConfiguredValue(normalizedOptions?.customEnv);
  if (customEnvConfigured) {
    return resolveCustomEnv({ customEnv: normalizedOptions!.customEnv ?? {} });
  }

  const gatewayConfigured = hasConfiguredValue(normalizedOptions?.gateway);
  const gatewayAuthFromEnv = getAiGatewayAuthFromEnv({ env });
  if (gatewayConfigured) {
    const apiKey =
      normalizedOptions!.gateway?.apiKey ?? gatewayAuthFromEnv.apiKey;
    const baseUrl =
      normalizedOptions!.gateway?.baseUrl ?? gatewayAuthFromEnv.baseUrl;
    if (apiKey) {
      return { AI_GATEWAY_API_KEY: apiKey, AI_GATEWAY_BASE_URL: baseUrl };
    }
    return {};
  }

  // Handle explicit string modes with process env
  if (typeof options === 'string') {
    switch (options) {
      case 'openai':
        if (env.OPENAI_API_KEY) {
          return {
            OPENAI_API_KEY: env.OPENAI_API_KEY,
            ...(env.OPENAI_BASE_URL
              ? { OPENAI_BASE_URL: env.OPENAI_BASE_URL }
              : {}),
          };
        }
        return {};
      case 'anthropic':
        if (env.ANTHROPIC_API_KEY) {
          return {
            ANTHROPIC_API_KEY: env.ANTHROPIC_API_KEY,
            ...(env.ANTHROPIC_BASE_URL
              ? { ANTHROPIC_BASE_URL: env.ANTHROPIC_BASE_URL }
              : {}),
            ...(env.ANTHROPIC_AUTH_TOKEN
              ? { ANTHROPIC_AUTH_TOKEN: env.ANTHROPIC_AUTH_TOKEN }
              : {}),
          };
        }
        return {};
      case 'custom': {
        const result: Record<string, string> = {};
        for (const [key, value] of Object.entries(env)) {
          if (
            value &&
            (key.endsWith('_API_KEY') ||
              key.endsWith('_BASE_URL') ||
              key === 'ANTHROPIC_AUTH_TOKEN')
          ) {
            result[key] = value;
          }
        }
        return result;
      }
      case 'ai-gateway':
        if (gatewayAuthFromEnv.apiKey) {
          return {
            AI_GATEWAY_API_KEY: gatewayAuthFromEnv.apiKey,
            AI_GATEWAY_BASE_URL: gatewayAuthFromEnv.baseUrl,
          };
        }
        return {};
      case 'auto':
      default:
        break;
    }
  }

  // Ambient gateway fallback.
  if (gatewayAuthFromEnv.apiKey) {
    return {
      AI_GATEWAY_API_KEY: gatewayAuthFromEnv.apiKey,
      AI_GATEWAY_BASE_URL: gatewayAuthFromEnv.baseUrl,
    };
  }

  // 'auto' fallback: pick up any other provider credentials from the env.
  const ambient: Record<string, string> = {};
  for (const [key, value] of Object.entries(env)) {
    if (
      value &&
      (key.endsWith('_API_KEY') ||
        key.endsWith('_BASE_URL') ||
        key === 'ANTHROPIC_AUTH_TOKEN')
    ) {
      ambient[key] = value;
    }
  }
  return ambient;
}

export async function registerPiProviders({
  options,
  resolvedEnv,
  registries,
  clientApp = HARNESS_CLIENT_APP,
}: {
  options: PiAuthOptions | undefined;
  resolvedEnv: Record<string, string>;
  registries: PiRegistries;
  clientApp?: string;
}): Promise<void> {
  const normalizedOptions = normalizePiAuthToLegacyAuth(options);
  if (hasConfiguredValue(normalizedOptions?.customEnv)) {
    await registerCustomProviders({
      customEnv: normalizedOptions!.customEnv ?? {},
      registries,
      clientApp,
    });
    return;
  }

  // Legacy customEnv was handled above. Everything else reduces to a mode:
  // string modes pass through, `undefined` is 'auto', and legacy gateway
  // objects fall through to the trailing gateway-registration block.
  const mode =
    typeof options === 'string' ? options : options == null ? 'auto' : 'legacy';

  switch (mode) {
    case 'openai': {
      const env = pickOpenAIEnv(resolvedEnv);
      await registerCustomProviders({
        customEnv: { ...pickOpenAIEnv(process.env), ...env },
        registries,
        clientApp,
      });
      return;
    }
    case 'anthropic': {
      const env = pickAnthropicEnv(resolvedEnv);
      await registerCustomProviders({
        customEnv: { ...pickAnthropicEnv(process.env), ...env },
        registries,
        clientApp,
      });
      return;
    }
    case 'custom': {
      // 'custom' registers every provider with credentials in the env.
      const env = pickProviderEnv(resolvedEnv);
      await registerCustomProviders({
        customEnv: { ...pickProviderEnv(process.env), ...env },
        registries,
        clientApp,
      });
      return;
    }
    case 'ai-gateway': {
      const gatewayAuth = getAiGatewayAuthFromEnv({ env: process.env });
      const gatewayApiKey =
        resolvedEnv.AI_GATEWAY_API_KEY ?? gatewayAuth.apiKey;
      const gatewayBaseUrl =
        resolvedEnv.AI_GATEWAY_BASE_URL ?? gatewayAuth.baseUrl;
      if (!gatewayApiKey) return;
      await register({
        registries,
        provider: 'vercel-ai-gateway',
        apiKey: gatewayApiKey,
        config: createGatewayProviderConfig({
          apiKey: gatewayApiKey,
          baseUrl: gatewayBaseUrl,
          clientApp,
        }),
      });
      return;
    }
    case 'legacy':
      break; // handled below
    case 'auto':
    default: {
      // 'auto' (the default): prefer the AI Gateway; only when no gateway
      // credentials exist, fall back to other providers found in the env.
      const gatewayAuth = getAiGatewayAuthFromEnv({ env: process.env });
      const gatewayApiKey =
        resolvedEnv.AI_GATEWAY_API_KEY ?? gatewayAuth.apiKey;
      const gatewayBaseUrl =
        resolvedEnv.AI_GATEWAY_BASE_URL ?? gatewayAuth.baseUrl;
      if (gatewayApiKey) {
        await register({
          registries,
          provider: 'vercel-ai-gateway',
          apiKey: gatewayApiKey,
          config: createGatewayProviderConfig({
            apiKey: gatewayApiKey,
            baseUrl: gatewayBaseUrl,
            clientApp,
          }),
        });
        return;
      }
      const env = pickProviderEnv(resolvedEnv);
      await registerCustomProviders({
        customEnv: { ...pickProviderEnv(process.env), ...env },
        registries,
        clientApp,
      });
      return;
    }
  }

  // Legacy explicit gateway object options.
  const apiKey = resolvedEnv.AI_GATEWAY_API_KEY;
  const baseUrl = resolvedEnv.AI_GATEWAY_BASE_URL;
  if (!apiKey || !baseUrl) return;

  await register({
    registries,
    provider: 'vercel-ai-gateway',
    apiKey,
    config: createGatewayProviderConfig({ apiKey, baseUrl, clientApp }),
  });
}

function pickOpenAIEnv(
  env: NodeJS.ProcessEnv | Record<string, string>,
): Record<string, string> {
  const result: Record<string, string> = {};
  if (env.OPENAI_API_KEY) result.OPENAI_API_KEY = env.OPENAI_API_KEY;
  if (env.OPENAI_BASE_URL) result.OPENAI_BASE_URL = env.OPENAI_BASE_URL;
  return result;
}

function pickAnthropicEnv(
  env: NodeJS.ProcessEnv | Record<string, string>,
): Record<string, string> {
  const result: Record<string, string> = {};
  if (env.ANTHROPIC_API_KEY) result.ANTHROPIC_API_KEY = env.ANTHROPIC_API_KEY;
  if (env.ANTHROPIC_BASE_URL)
    result.ANTHROPIC_BASE_URL = env.ANTHROPIC_BASE_URL;
  if (env.ANTHROPIC_AUTH_TOKEN)
    result.ANTHROPIC_AUTH_TOKEN = env.ANTHROPIC_AUTH_TOKEN;
  return result;
}

/**
 * Filters an env object down to provider-credential keys (`*_API_KEY`,
 * `*_BASE_URL`, `ANTHROPIC_AUTH_TOKEN`). Pi does not read provider
 * credentials from the environment itself — providers are only registered
 * through `registerProvider` / `setRuntimeApiKey` — so we must extract the
 * relevant entries before handing them to `registerCustomProviders`.
 */
function pickProviderEnv(
  env: NodeJS.ProcessEnv | Record<string, string>,
): Record<string, string> {
  const result: Record<string, string> = {};
  for (const [key, value] of Object.entries(env)) {
    if (
      value &&
      (key.endsWith('_API_KEY') ||
        key.endsWith('_BASE_URL') ||
        key === 'ANTHROPIC_AUTH_TOKEN')
    ) {
      result[key] = value;
    }
  }
  return result;
}

function normalizePiAuthToLegacyAuth(
  options: PiAuthOptions | undefined,
): LegacyPiAuthOptions | undefined {
  if (options == null || options === 'auto') {
    return undefined;
  }
  if (typeof options === 'string') {
    switch (options) {
      case 'ai-gateway':
        return { gateway: {} };
      case 'custom':
      case 'openai':
      case 'anthropic':
        return { customEnv: {} };
      default:
        return undefined;
    }
  }

  console.warn(
    '[pi] Passing an object to auth options is deprecated. Use a string mode ("auto" | "openai" | "anthropic" | "custom" | "ai-gateway") instead, and pass credentials via environment variables.',
  );
  return options;
}

function resolveCustomEnv({
  customEnv,
}: {
  customEnv: Record<string, string>;
}): Record<string, string> {
  const apiKey = customEnv.AI_GATEWAY_API_KEY;
  if (!apiKey) return {};

  return {
    AI_GATEWAY_API_KEY: apiKey,
    AI_GATEWAY_BASE_URL:
      customEnv.AI_GATEWAY_BASE_URL ?? DEFAULT_GATEWAY_BASE_URL,
  };
}

async function registerCustomProviders({
  customEnv,
  registries,
  clientApp,
}: {
  customEnv: Record<string, string>;
  registries: PiRegistries;
  clientApp: string;
}): Promise<void> {
  const gatewayKey = customEnv.AI_GATEWAY_API_KEY;
  if (gatewayKey) {
    const baseUrl = customEnv.AI_GATEWAY_BASE_URL ?? DEFAULT_GATEWAY_BASE_URL;
    await register({
      registries,
      provider: 'vercel-ai-gateway',
      apiKey: gatewayKey,
      config: createGatewayProviderConfig({
        apiKey: gatewayKey,
        baseUrl,
        clientApp,
      }),
    });
  }

  if (customEnv.OPENAI_API_KEY) {
    const baseUrl = customEnv.OPENAI_BASE_URL ?? DEFAULT_OPENAI_BASE_URL;
    await register({
      registries,
      provider: 'openai',
      apiKey: customEnv.OPENAI_API_KEY,
      config: {
        apiKey: customEnv.OPENAI_API_KEY,
        baseUrl,
        authHeader: true,
      },
    });
  }

  if (customEnv.ANTHROPIC_API_KEY) {
    const baseUrl = customEnv.ANTHROPIC_BASE_URL ?? DEFAULT_ANTHROPIC_BASE_URL;
    await register({
      registries,
      provider: 'anthropic',
      apiKey: customEnv.ANTHROPIC_API_KEY,
      config: {
        apiKey: customEnv.ANTHROPIC_API_KEY,
        baseUrl,
        ...(customEnv.ANTHROPIC_AUTH_TOKEN
          ? {
              headers: {
                authorization: `Bearer ${customEnv.ANTHROPIC_AUTH_TOKEN}`,
              },
            }
          : {}),
      },
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
    await register({
      registries,
      provider,
      apiKey,
      config: {
        apiKey,
        baseUrl,
        authHeader: true,
      },
    });
  }
}
