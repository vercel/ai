import {
  ModelRuntime,
  type CreateModelRuntimeOptions,
  type ModelRegistry,
} from '@earendil-works/pi-coding-agent';
import type { HarnessV1Authentication } from '@ai-sdk/harness';
import {
  getAiGatewayAuthFromEnv,
  isHarnessAuthenticationEnvironment,
} from '@ai-sdk/harness/utils';
import { access } from 'node:fs/promises';
import { VERSION } from './version';

type ProviderConfigInput = Parameters<ModelRegistry['registerProvider']>[1];
type PiCredentialStore = NonNullable<CreateModelRuntimeOptions['credentials']>;
type PiCredential = Exclude<
  Awaited<ReturnType<PiCredentialStore['read']>>,
  undefined
>;
type PiModelRuntimeInternals = {
  models: {
    authContext: {
      env(name: string): Promise<string | undefined>;
      fileExists(path: string): Promise<boolean>;
    };
  };
};
type PiMutableProvider = {
  auth: ReturnType<ModelRuntime['getProviders']>[number]['auth'];
};

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

function createIsolatedPiCredentialStore(): {
  credentials: PiCredentialStore;
  finishInitialization(): void;
} {
  let initializing = true;
  const bootstrapEnvironment = new Proxy<Record<string, string>>(
    {},
    {
      get: (_target, property) =>
        typeof property === 'string'
          ? 'harness-pi-authentication-bootstrap'
          : undefined,
    },
  );
  const bootstrapCredential = {
    type: 'api_key',
    key: 'harness-pi-authentication-bootstrap',
    env: bootstrapEnvironment,
  } satisfies PiCredential;
  const credentials: PiCredentialStore = {
    async read() {
      return initializing ? bootstrapCredential : undefined;
    },
    async list() {
      return [];
    },
    async modify(..._input: Parameters<PiCredentialStore['modify']>) {
      return undefined;
    },
    async delete() {},
  };

  return {
    credentials,
    finishInitialization() {
      initializing = false;
    },
  };
}

function scopePiProviderEnvironment({
  modelRuntime,
  authenticationEnvironment,
}: {
  modelRuntime: ModelRuntime;
  authenticationEnvironment: Record<string, string>;
}): void {
  for (const provider of modelRuntime.getProviders()) {
    const apiKeyAuthentication = provider.auth.apiKey;
    if (!apiKeyAuthentication) continue;

    (provider as unknown as PiMutableProvider).auth = {
      ...provider.auth,
      apiKey: {
        ...apiKeyAuthentication,
        resolve: async input => {
          const result = await apiKeyAuthentication.resolve(input);
          return result
            ? {
                ...result,
                env: {
                  ...authenticationEnvironment,
                  ...result.env,
                },
              }
            : undefined;
        },
      },
    };
  }
}

export async function createPiModelRuntime({
  auth,
  authPath,
  modelsPath,
}: {
  auth: PiAuthenticationMode | undefined;
  authPath: string;
  modelsPath: string;
}): Promise<ModelRuntime> {
  if (!isHarnessAuthenticationEnvironment(auth)) {
    return ModelRuntime.create({
      authPath,
      modelsPath,
      allowModelNetwork: false,
    });
  }

  const isolatedCredentials = createIsolatedPiCredentialStore();
  const modelRuntime = await ModelRuntime.create({
    credentials: isolatedCredentials.credentials,
    modelsPath: null,
    allowModelNetwork: false,
  });

  /*
   * ModelRuntime creates its internal model collection with a process-backed
   * authentication context and does not expose an authentication-context
   * option. The bootstrap credential prevents construction-time provider
   * checks from consulting that context. Once constructed, authentication is
   * scoped to the supplied record and availability is recomputed with an
   * empty in-memory credential store.
   */
  (modelRuntime as unknown as PiModelRuntimeInternals).models.authContext = {
    async env(name) {
      return auth[name];
    },
    async fileExists(filePath) {
      if (filePath !== auth.GOOGLE_APPLICATION_CREDENTIALS) return false;
      try {
        await access(filePath);
        return true;
      } catch {
        return false;
      }
    },
  };
  scopePiProviderEnvironment({
    modelRuntime,
    authenticationEnvironment: auth,
  });
  isolatedCredentials.finishInitialization();
  await modelRuntime.refresh({ allowNetwork: false });

  return modelRuntime;
}

function createGatewayProviderConfig({
  apiKey,
  baseUrl,
  clientApp,
  headers,
}: {
  apiKey: string;
  baseUrl: string;
  clientApp: string;
  headers?: Readonly<Record<string, string>>;
}): ProviderConfigInput {
  return {
    apiKey,
    baseUrl,
    authHeader: true,
    headers: {
      ...headers,
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
  headers,
}: {
  options: PiAuthenticationMode | undefined;
  resolvedEnv: Record<string, string>;
  registries: PiRegistries;
  clientApp?: string;
  headers?: Readonly<Record<string, string>>;
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
        headers,
      });
      return;
    }
    case 'anthropic': {
      const env = pickAnthropicEnv(resolvedEnv);
      await registerCustomProviders({
        customEnv: { ...pickAnthropicEnv(authenticationEnvironment), ...env },
        registries,
        clientApp,
        headers,
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
        headers,
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
          headers,
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
            headers,
          }),
        });
        return;
      }
      const env = pickProviderEnv(resolvedEnv);
      await registerCustomProviders({
        customEnv: { ...pickProviderEnv(authenticationEnvironment), ...env },
        registries,
        clientApp,
        headers,
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
  headers,
}: {
  customEnv: Record<string, string>;
  registries: PiRegistries;
  clientApp: string;
  headers?: Readonly<Record<string, string>>;
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
        headers,
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
        ...(headers ? { headers } : {}),
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
        ...(headers || customEnv.ANTHROPIC_AUTH_TOKEN
          ? {
              headers: {
                ...headers,
                ...(customEnv.ANTHROPIC_AUTH_TOKEN
                  ? {
                      authorization: `Bearer ${customEnv.ANTHROPIC_AUTH_TOKEN}`,
                    }
                  : {}),
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
        ...(headers ? { headers } : {}),
      },
    });
  }
}
