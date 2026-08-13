import { ModelRegistry, ModelRuntime } from '@earendil-works/pi-coding-agent';
import { rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  registerPiProviders,
  resolvePiEnv,
  type PiAuthOptions,
} from './pi-auth';

const authPaths: string[] = [];

function clearAmbientProviderCredentials() {
  for (const key of Object.keys(process.env)) {
    if (
      key.endsWith('_API_KEY') ||
      key.endsWith('_BASE_URL') ||
      key === 'ANTHROPIC_AUTH_TOKEN' ||
      key === 'VERCEL_OIDC_TOKEN'
    ) {
      vi.stubEnv(key, undefined);
    }
  }
}

afterEach(async () => {
  vi.unstubAllEnvs();
  await Promise.all(
    authPaths.splice(0).map(authPath => rm(authPath, { force: true })),
  );
});

async function makeRegistries() {
  const authPath = path.join(tmpdir(), `harness-pi-auth-${randomUUID()}.json`);
  authPaths.push(authPath);
  const modelRuntime = await ModelRuntime.create({
    authPath,
    modelsPath: null,
    allowModelNetwork: false,
  });
  const modelRegistry = new ModelRegistry(modelRuntime);
  const setRuntimeApiKey = vi.spyOn(modelRuntime, 'setRuntimeApiKey');
  const registerProvider = vi.spyOn(modelRegistry, 'registerProvider');
  return { modelRegistry, modelRuntime, setRuntimeApiKey, registerProvider };
}

async function registerProviders({
  options,
  resolvedEnv,
}: {
  options: PiAuthOptions | undefined;
  resolvedEnv: Record<string, string>;
}) {
  const registries = await makeRegistries();
  await registerPiProviders({
    options,
    resolvedEnv,
    registries,
  });
  return registries;
}

describe('resolvePiEnv', () => {
  it('uses explicit gateway settings when configured', () => {
    expect(
      resolvePiEnv({
        options: {
          gateway: { apiKey: 'gw-key', baseUrl: 'https://gw.example' },
        },
        env: {},
      }),
    ).toEqual({
      AI_GATEWAY_API_KEY: 'gw-key',
      AI_GATEWAY_BASE_URL: 'https://gw.example',
    });
  });

  it('uses env gateway auth when explicit gateway only sets base URL', () => {
    expect(
      resolvePiEnv({
        options: { gateway: { baseUrl: 'https://gw.example' } },
        env: { VERCEL_OIDC_TOKEN: 'oidc-env' },
      }),
    ).toEqual({
      AI_GATEWAY_API_KEY: 'oidc-env',
      AI_GATEWAY_BASE_URL: 'https://gw.example',
    });
  });

  it('returns only gateway values from customEnv', () => {
    expect(
      resolvePiEnv({
        options: {
          customEnv: {
            AI_GATEWAY_API_KEY: 'gw',
            OPENAI_API_KEY: 'oai',
            ANTHROPIC_API_KEY: 'ant',
          },
        },
        env: {},
      }),
    ).toEqual({
      AI_GATEWAY_API_KEY: 'gw',
      AI_GATEWAY_BASE_URL: 'https://ai-gateway.vercel.sh',
    });
  });

  it('falls back to ambient AI_GATEWAY_API_KEY when no options', () => {
    expect(
      resolvePiEnv({
        options: undefined,
        env: {
          AI_GATEWAY_API_KEY: 'ambient',
          AI_GATEWAY_BASE_URL: 'https://amb',
        },
      }),
    ).toEqual({
      AI_GATEWAY_API_KEY: 'ambient',
      AI_GATEWAY_BASE_URL: 'https://amb',
    });
  });

  it('falls back to ambient VERCEL_OIDC_TOKEN', () => {
    expect(
      resolvePiEnv({
        options: undefined,
        env: { VERCEL_OIDC_TOKEN: 'oidc' },
      }),
    ).toEqual({
      AI_GATEWAY_API_KEY: 'oidc',
      AI_GATEWAY_BASE_URL: 'https://ai-gateway.vercel.sh',
    });
  });

  it('returns {} when no auth is configured anywhere', () => {
    expect(resolvePiEnv({ options: undefined, env: {} })).toEqual({});
  });

  it('supports string authentication modes', () => {
    expect(
      resolvePiEnv({
        options: 'ai-gateway',
        env: { AI_GATEWAY_API_KEY: 'gw-mode' },
      }),
    ).toEqual({
      AI_GATEWAY_API_KEY: 'gw-mode',
      AI_GATEWAY_BASE_URL: 'https://ai-gateway.vercel.sh',
    });

    expect(
      resolvePiEnv({
        options: 'openai',
        env: { OPENAI_API_KEY: 'sk-test' },
      }),
    ).toEqual({
      OPENAI_API_KEY: 'sk-test',
    });

    expect(
      resolvePiEnv({
        options: 'anthropic',
        env: { ANTHROPIC_API_KEY: 'sk-ant' },
      }),
    ).toEqual({
      ANTHROPIC_API_KEY: 'sk-ant',
    });

    expect(
      resolvePiEnv({
        options: 'custom',
        env: {
          MISTRAL_API_KEY: 'mk',
          MISTRAL_BASE_URL: 'https://api.mistral.example',
        },
      }),
    ).toEqual({
      MISTRAL_API_KEY: 'mk',
      MISTRAL_BASE_URL: 'https://api.mistral.example',
    });
  });

  it('warns when passing a legacy object shape', () => {
    const spy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    resolvePiEnv({ options: { gateway: {} }, env: {} });
    expect(spy).toHaveBeenCalledWith(
      expect.stringContaining(
        'Passing an object to auth options is deprecated',
      ),
    );
    spy.mockRestore();
  });
});

describe('registerPiProviders', () => {
  it('registers resolved gateway auth', async () => {
    const options = {
      gateway: { apiKey: 'gw-key', baseUrl: 'https://gw.example' },
    } satisfies PiAuthOptions;
    const resolvedEnv = resolvePiEnv({ options, env: {} });
    const registries = await registerProviders({ options, resolvedEnv });

    expect(registries.setRuntimeApiKey).toHaveBeenCalledWith(
      'vercel-ai-gateway',
      'gw-key',
    );
    expect(registries.registerProvider).toHaveBeenCalledWith(
      'vercel-ai-gateway',
      {
        apiKey: 'gw-key',
        baseUrl: 'https://gw.example',
        authHeader: true,
        headers: {
          'User-Agent': 'ai-sdk/harness-pi/0.0.0-test',
          'x-client-app': 'ai-sdk/harness-pi/0.0.0-test',
        },
      },
    );
  });

  it('registers all known custom providers', async () => {
    const options = {
      customEnv: {
        AI_GATEWAY_API_KEY: 'gw',
        OPENAI_API_KEY: 'oai',
        ANTHROPIC_API_KEY: 'ant',
        ANTHROPIC_AUTH_TOKEN: 'tok',
      },
    } satisfies PiAuthOptions;
    const resolvedEnv = resolvePiEnv({ options, env: {} });
    const registries = await registerProviders({ options, resolvedEnv });
    const registeredProviders = registries.registerProvider.mock.calls
      .map(call => call[0])
      .sort();

    expect(registeredProviders).toEqual([
      'anthropic',
      'openai',
      'vercel-ai-gateway',
    ]);
    const anthropicCall = registries.registerProvider.mock.calls.find(
      call => call[0] === 'anthropic',
    );
    expect(anthropicCall?.[1].headers).toEqual({
      authorization: 'Bearer tok',
    });
    const gatewayCall = registries.registerProvider.mock.calls.find(
      call => call[0] === 'vercel-ai-gateway',
    );
    expect(gatewayCall?.[1].headers).toEqual({
      'User-Agent': 'ai-sdk/harness-pi/0.0.0-test',
      'x-client-app': 'ai-sdk/harness-pi/0.0.0-test',
    });
  });

  it('registers arbitrary custom providers with API key and base URL', async () => {
    const options = {
      customEnv: {
        MISTRAL_API_KEY: 'mk',
        MISTRAL_BASE_URL: 'https://api.mistral.example',
      },
    } satisfies PiAuthOptions;
    const resolvedEnv = resolvePiEnv({ options, env: {} });
    const registries = await registerProviders({ options, resolvedEnv });

    expect(registries.setRuntimeApiKey).toHaveBeenCalledWith('mistral', 'mk');
    expect(registries.registerProvider).toHaveBeenCalledWith('mistral', {
      apiKey: 'mk',
      baseUrl: 'https://api.mistral.example',
      authHeader: true,
    });
  });

  it('does not register providers when no auth is configured', async () => {
    clearAmbientProviderCredentials();

    const registries = await registerProviders({
      options: undefined,
      resolvedEnv: {},
    });

    expect(registries.setRuntimeApiKey).not.toHaveBeenCalled();
    expect(registries.registerProvider).not.toHaveBeenCalled();
  });

  it('registers only openai when openai mode is explicit', async () => {
    vi.stubEnv('OPENAI_API_KEY', 'sk-oai');
    vi.stubEnv('ANTHROPIC_API_KEY', 'sk-ant');
    vi.stubEnv('AI_GATEWAY_API_KEY', 'gw');

    const resolvedEnv = resolvePiEnv({
      options: 'openai',
      env: {
        OPENAI_API_KEY: 'sk-oai',
        ANTHROPIC_API_KEY: 'sk-ant',
        AI_GATEWAY_API_KEY: 'gw',
      },
    });
    expect(resolvedEnv).toEqual({ OPENAI_API_KEY: 'sk-oai' });

    const registries = await registerProviders({
      options: 'openai',
      resolvedEnv,
    });
    const providers = registries.registerProvider.mock.calls.map(c => c[0]);

    expect(providers).toEqual(['openai']);
    expect(registries.setRuntimeApiKey).toHaveBeenCalledWith(
      'openai',
      'sk-oai',
    );
    expect(registries.registerProvider).toHaveBeenCalledWith('openai', {
      apiKey: 'sk-oai',
      baseUrl: 'https://api.openai.com/v1',
      authHeader: true,
    });
  });

  it('registers only anthropic when anthropic mode is explicit', async () => {
    vi.stubEnv('ANTHROPIC_API_KEY', 'sk-ant');
    vi.stubEnv('ANTHROPIC_AUTH_TOKEN', 'tok');
    vi.stubEnv('OPENAI_API_KEY', 'sk-oai');

    const resolvedEnv = resolvePiEnv({
      options: 'anthropic',
      env: {
        ANTHROPIC_API_KEY: 'sk-ant',
        ANTHROPIC_AUTH_TOKEN: 'tok',
        OPENAI_API_KEY: 'sk-oai',
      },
    });
    expect(resolvedEnv).toEqual({
      ANTHROPIC_API_KEY: 'sk-ant',
      ANTHROPIC_AUTH_TOKEN: 'tok',
    });

    const registries = await registerProviders({
      options: 'anthropic',
      resolvedEnv,
    });
    const providers = registries.registerProvider.mock.calls.map(c => c[0]);

    expect(providers).toEqual(['anthropic']);
    expect(registries.registerProvider).toHaveBeenCalledWith('anthropic', {
      apiKey: 'sk-ant',
      baseUrl: 'https://api.anthropic.com',
      headers: { authorization: 'Bearer tok' },
    });
  });

  it('registers only gateway when ai-gateway mode is explicit', async () => {
    vi.stubEnv('AI_GATEWAY_API_KEY', 'gw');
    vi.stubEnv('OPENAI_API_KEY', 'sk-oai');
    vi.stubEnv('ANTHROPIC_API_KEY', 'sk-ant');

    const resolvedEnv = resolvePiEnv({
      options: 'ai-gateway',
      env: {
        AI_GATEWAY_API_KEY: 'gw',
        OPENAI_API_KEY: 'sk-oai',
        ANTHROPIC_API_KEY: 'sk-ant',
      },
    });
    expect(resolvedEnv).toEqual({
      AI_GATEWAY_API_KEY: 'gw',
      AI_GATEWAY_BASE_URL: 'https://ai-gateway.vercel.sh',
    });

    const registries = await registerProviders({
      options: 'ai-gateway',
      resolvedEnv,
    });
    const providers = registries.registerProvider.mock.calls.map(c => c[0]);

    expect(providers).toEqual(['vercel-ai-gateway']);
  });

  it('registers nothing when ai-gateway mode has no gateway credentials', async () => {
    vi.stubEnv('AI_GATEWAY_API_KEY', '');
    vi.stubEnv('VERCEL_OIDC_TOKEN', '');
    vi.stubEnv('OPENAI_API_KEY', 'sk-oai');

    const resolvedEnv = resolvePiEnv({
      options: 'ai-gateway',
      env: { OPENAI_API_KEY: 'sk-oai' },
    });
    expect(resolvedEnv).toEqual({});

    const registries = await registerProviders({
      options: 'ai-gateway',
      resolvedEnv,
    });

    expect(registries.setRuntimeApiKey).not.toHaveBeenCalled();
    expect(registries.registerProvider).not.toHaveBeenCalled();
  });

  it('auto mode prefers the gateway over other provider credentials', async () => {
    vi.stubEnv('AI_GATEWAY_API_KEY', 'gw');
    vi.stubEnv('OPENAI_API_KEY', 'sk-oai');
    vi.stubEnv('ANTHROPIC_API_KEY', 'sk-ant');

    const resolvedEnv = resolvePiEnv({
      options: 'auto',
      env: {
        AI_GATEWAY_API_KEY: 'gw',
        OPENAI_API_KEY: 'sk-oai',
        ANTHROPIC_API_KEY: 'sk-ant',
      },
    });
    expect(resolvedEnv).toEqual({
      AI_GATEWAY_API_KEY: 'gw',
      AI_GATEWAY_BASE_URL: 'https://ai-gateway.vercel.sh',
    });

    const registries = await registerProviders({
      options: 'auto',
      resolvedEnv,
    });
    const providers = registries.registerProvider.mock.calls.map(c => c[0]);

    expect(providers).toEqual(['vercel-ai-gateway']);
  });

  it('auto mode falls back to other providers when no gateway credentials exist', async () => {
    vi.stubEnv('OPENAI_API_KEY', 'sk-oai');
    vi.stubEnv('ANTHROPIC_API_KEY', 'sk-ant');
    vi.stubEnv('MISTRAL_API_KEY', 'mk');
    vi.stubEnv('MISTRAL_BASE_URL', 'https://api.mistral.example');
    vi.stubEnv('AI_GATEWAY_API_KEY', '');
    vi.stubEnv('VERCEL_OIDC_TOKEN', '');

    const resolvedEnv = resolvePiEnv({
      options: 'auto',
      env: {
        OPENAI_API_KEY: 'sk-oai',
        ANTHROPIC_API_KEY: 'sk-ant',
        MISTRAL_API_KEY: 'mk',
        MISTRAL_BASE_URL: 'https://api.mistral.example',
      },
    });
    expect(resolvedEnv).toEqual({
      OPENAI_API_KEY: 'sk-oai',
      ANTHROPIC_API_KEY: 'sk-ant',
      MISTRAL_API_KEY: 'mk',
      MISTRAL_BASE_URL: 'https://api.mistral.example',
    });

    const registries = await registerProviders({
      options: 'auto',
      resolvedEnv,
    });
    const providers = registries.registerProvider.mock.calls
      .map(c => c[0])
      .sort();

    expect(providers).toEqual(['anthropic', 'mistral', 'openai']);
  });

  it('custom mode registers all provider env vars including gateway', async () => {
    clearAmbientProviderCredentials();
    vi.stubEnv('AI_GATEWAY_API_KEY', 'gw');
    vi.stubEnv('OPENAI_API_KEY', 'sk-oai');
    vi.stubEnv('MISTRAL_API_KEY', 'mk');
    vi.stubEnv('MISTRAL_BASE_URL', 'https://api.mistral.example');

    const resolvedEnv = resolvePiEnv({
      options: 'custom',
      env: {
        AI_GATEWAY_API_KEY: 'gw',
        OPENAI_API_KEY: 'sk-oai',
        MISTRAL_API_KEY: 'mk',
        MISTRAL_BASE_URL: 'https://api.mistral.example',
      },
    });
    expect(resolvedEnv).toEqual({
      AI_GATEWAY_API_KEY: 'gw',
      OPENAI_API_KEY: 'sk-oai',
      MISTRAL_API_KEY: 'mk',
      MISTRAL_BASE_URL: 'https://api.mistral.example',
    });

    const registries = await registerProviders({
      options: 'custom',
      resolvedEnv,
    });
    const providers = registries.registerProvider.mock.calls
      .map(c => c[0])
      .sort();

    expect(providers).toEqual(['mistral', 'openai', 'vercel-ai-gateway']);
  });
});
