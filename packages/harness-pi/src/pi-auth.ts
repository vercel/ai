import type {
  ModelRegistry,
  ModelRuntime,
} from '@earendil-works/pi-coding-agent';
import type { HarnessV1Authentication } from '@ai-sdk/harness';
import {
  getAiGatewayAuthFromEnv,
  isHarnessAuthenticationEnvironment,
} from '@ai-sdk/harness/utils';
import { VERSION } from './version';

type ProviderConfigInput = Parameters<ModelRegistry['registerProvider']>[1];

/**
 * Pi auth options. Choose an explicit mode or rely on 'auto' (precedence:
 * explicit gateway, then OpenAI / Anthropic / custom environment variables).
 */
export type PiAuthenticationMode = HarnessV1Authentication<
  'openai' | 'anthropic' | 'custom'
>;

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

export function resolvePiEnv({
  options,
  env,
}: {
  options: PiAuthenticationMode | undefined;
  env: NodeJS.ProcessEnv;
}): Record<string, string> {
  const suppliedEnvironment = isHarnessAuthenticationEnvironment(options);
  const authenticationEnvironment = suppliedEnvironment ? options : env;
  const gatewayAuthFromEnv = getAiGatewayAuthFromEnv({
    env: authenticationEnvironment,
  });

  // Handle explicit string modes with process env
  if (typeof options === 'string') {
    switch (options) {
      case 'openai':
        if (authenticationEnvironment.OPENAI_API_KEY) {
          return {
            OPENAI_API_KEY: authenticationEnvironment.OPENAI_API_KEY,
            ...(authenticationEnvironment.OPENAI_BASE_URL
              ? { OPENAI_BASE_URL: authenticationEnvironment.OPENAI_BASE_URL }
              : {}),
          };
        }
        return {};
      case 'anthropic':
        if (authenticationEnvironment.ANTHROPIC_API_KEY) {
          return {
            ANTHROPIC_API_KEY: authenticationEnvironment.ANTHROPIC_API_KEY,
            ...(authenticationEnvironment.ANTHROPIC_BASE_URL
              ? {
                  ANTHROPIC_BASE_URL:
                    authenticationEnvironment.ANTHROPIC_BASE_URL,
                }
              : {}),
            ...(authenticationEnvironment.ANTHROPIC_AUTH_TOKEN
              ? {
                  ANTHROPIC_AUTH_TOKEN:
                    authenticationEnvironment.ANTHROPIC_AUTH_TOKEN,
                }
              : {}),
          };
        }
        return {};
      case 'custom': {
        const result: Record<string, string> = {};
        for (const [key, value] of Object.entries(authenticationEnvironment)) {
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
  for (const [key, value] of Object.entries(authenticationEnvironment)) {
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
  options: PiAuthenticationMode | undefined;
  resolvedEnv: Record<string, string>;
  registries: PiRegistries;
  clientApp?: string;
}): Promise<void> {
  const suppliedEnvironment = isHarnessAuthenticationEnvironment(options);
  const authenticationEnvironment = suppliedEnvironment ? options : process.env;
  const mode = typeof options === 'string' ? options : 'auto';

  switch (mode) {
    case 'openai': {
      const env = pickOpenAIEnv(resolvedEnv);
      await registerCustomProviders({
        customEnv: { ...pickOpenAIEnv(authenticationEnvironment), ...env },
        registries,
        clientApp,
      });
      return;
    }
    case 'anthropic': {
      const env = pickAnthropicEnv(resolvedEnv);
      await registerCustomProviders({
        customEnv: { ...pickAnthropicEnv(authenticationEnvironment), ...env },
        registries,
        clientApp,
      });
      return;
    }
    case 'custom': {
      // 'custom' registers every provider with credentials in the env.
      const env = pickProviderEnv(resolvedEnv);
      await registerCustomProviders({
        customEnv: { ...pickProviderEnv(authenticationEnvironment), ...env },
        registries,
        clientApp,
      });
      return;
    }
    case 'ai-gateway': {
      const gatewayAuth = getAiGatewayAuthFromEnv({
        env: authenticationEnvironment,
      });
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
    case 'auto':
    default: {
      // 'auto' (the default): prefer the AI Gateway; only when no gateway
      // credentials exist, fall back to other providers found in the env.
      const gatewayAuth = getAiGatewayAuthFromEnv({
        env: authenticationEnvironment,
      });
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
        customEnv: { ...pickProviderEnv(authenticationEnvironment), ...env },
        registries,
        clientApp,
      });
      return;
    }
  }
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
