import { ModelRegistry, ModelRuntime } from '@earendil-works/pi-coding-agent';
import { rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  createPiModelRuntime,
  registerPiProviders,
  resolvePiEnv,
  type PiAuthenticationMode,
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
  headers,
}: {
  options: PiAuthenticationMode | undefined;
  resolvedEnv: Record<string, string>;
  headers?: Readonly<Record<string, string>>;
}) {
  const registries = await makeRegistries();
  await registerPiProviders({
    options,
    resolvedEnv,
    registries,
    headers,
  });
  return registries;
}

describe('resolvePiEnv', () => {
  it('uses a supplied gateway authentication environment', () => {
    expect(
      resolvePiEnv({
        options: {
          AI_GATEWAY_API_KEY: 'gw-key',
          AI_GATEWAY_BASE_URL: 'https://gw.example',
        },
        env: {},
      }),
    ).toEqual({
      AI_GATEWAY_API_KEY: 'gw-key',
      AI_GATEWAY_BASE_URL: 'https://gw.example',
    });
  });

  it('resolves OIDC gateway auth from a supplied authentication environment', () => {
    expect(
      resolvePiEnv({
        options: {
          AI_GATEWAY_BASE_URL: 'https://gw.example',
          VERCEL_OIDC_TOKEN: 'oidc-env',
        },
        env: {},
      }),
    ).toEqual({
      AI_GATEWAY_API_KEY: 'oidc-env',
      AI_GATEWAY_BASE_URL: 'https://gw.example',
    });
  });

  it('returns only gateway values when auto-selecting from an authentication environment', () => {
    expect(
      resolvePiEnv({
        options: {
          AI_GATEWAY_API_KEY: 'gw',
          OPENAI_API_KEY: 'oai',
          ANTHROPIC_API_KEY: 'ant',
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

  it('uses a supplied authentication environment instead of ambient credentials', () => {
    expect(
      resolvePiEnv({
        options: { OPENAI_API_KEY: 'programmatic-openai-key' },
        env: { AI_GATEWAY_API_KEY: 'ambient-gateway-key' },
      }),
    ).toEqual({ OPENAI_API_KEY: 'programmatic-openai-key' });
  });

  it('rejects nested authentication objects before reading ambient credentials', () => {
    expect(() =>
      resolvePiEnv({
        options: { gateway: { apiKey: 'legacy-key' } } as never,
        env: { AI_GATEWAY_API_KEY: 'ambient-gateway-key' },
      }),
    ).toThrow(
      'Invalid auth: expected an authentication mode or a flat record with string values.',
    );
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
});

describe('createPiModelRuntime', () => {
  it('does not use ambient credentials for an empty authentication environment override', async () => {
    clearAmbientProviderCredentials();
    vi.stubEnv('OPENAI_API_KEY', 'ambient-openai-key');
    vi.stubEnv('AWS_PROFILE', 'ambient-aws-profile');
    const authPath = path.join(
      tmpdir(),
      `harness-pi-auth-${randomUUID()}.json`,
    );
    authPaths.push(authPath);

    const modelRuntime = await createPiModelRuntime({
      auth: {},
      authPath,
      modelsPath: `${authPath}.models`,
    });

    await expect(modelRuntime.getAuth('openai')).resolves.toBeUndefined();
    await expect(
      modelRuntime.getAuth('amazon-bedrock'),
    ).resolves.toBeUndefined();
  });

  it('uses credentials exclusively from an authentication environment override', async () => {
    clearAmbientProviderCredentials();
    vi.stubEnv('OPENAI_API_KEY', 'ambient-openai-key');
    vi.stubEnv('AWS_PROFILE', 'ambient-aws-profile');
    const authPath = path.join(
      tmpdir(),
      `harness-pi-auth-${randomUUID()}.json`,
    );
    authPaths.push(authPath);

    const modelRuntime = await createPiModelRuntime({
      auth: {
        OPENAI_API_KEY: 'override-openai-key',
        AWS_PROFILE: 'override-aws-profile',
        CUSTOM_PROVIDER_SETTING: 'override-setting',
      },
      authPath,
      modelsPath: `${authPath}.models`,
    });

    await expect(modelRuntime.getAuth('openai')).resolves.toMatchObject({
      auth: { apiKey: 'override-openai-key' },
      env: {
        OPENAI_API_KEY: 'override-openai-key',
        AWS_PROFILE: 'override-aws-profile',
        CUSTOM_PROVIDER_SETTING: 'override-setting',
      },
      source: 'OPENAI_API_KEY',
    });
    await expect(modelRuntime.getAuth('amazon-bedrock')).resolves.toMatchObject(
      {
        auth: {},
        env: {
          OPENAI_API_KEY: 'override-openai-key',
          AWS_PROFILE: 'override-aws-profile',
          CUSTOM_PROVIDER_SETTING: 'override-setting',
        },
        source: 'AWS_PROFILE',
      },
    );
  });

  it('preserves ambient credential lookup for auto authentication', async () => {
    clearAmbientProviderCredentials();
    vi.stubEnv('OPENAI_API_KEY', 'ambient-openai-key');
    const authPath = path.join(
      tmpdir(),
      `harness-pi-auth-${randomUUID()}.json`,
    );
    authPaths.push(authPath);

    const modelRuntime = await createPiModelRuntime({
      auth: 'auto',
      authPath,
      modelsPath: `${authPath}.models`,
    });

    await expect(modelRuntime.getAuth('openai')).resolves.toMatchObject({
      auth: { apiKey: 'ambient-openai-key' },
      source: 'OPENAI_API_KEY',
    });
  });
});

describe('registerPiProviders', () => {
  it('does not register ambient providers for a supplied authentication environment', async () => {
    clearAmbientProviderCredentials();
    vi.stubEnv('AI_GATEWAY_API_KEY', 'ambient-gateway-key');
    const options = {
      OPENAI_API_KEY: 'programmatic-openai-key',
    } satisfies PiAuthenticationMode;
    const resolvedEnv = resolvePiEnv({ options, env: process.env });
    const registries = await registerProviders({ options, resolvedEnv });

    expect(registries.setRuntimeApiKey).toHaveBeenCalledTimes(1);
    expect(registries.setRuntimeApiKey).toHaveBeenCalledWith(
      'openai',
      'programmatic-openai-key',
    );
  });

  it('registers resolved gateway auth', async () => {
    const options = {
      AI_GATEWAY_API_KEY: 'gw-key',
      AI_GATEWAY_BASE_URL: 'https://gw.example',
    } satisfies PiAuthenticationMode;
    const resolvedEnv = resolvePiEnv({ options, env: {} });
    const registries = await registerProviders({
      options,
      resolvedEnv,
      headers: {
        'x-tenant': 'acme',
        'User-Agent': 'caller-agent',
      },
    });

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
          'x-tenant': 'acme',
          'User-Agent': 'ai-sdk/harness-pi/0.0.0-test',
          'x-client-app': 'ai-sdk/harness-pi/0.0.0-test',
        },
      },
    );
  });

  it('registers all known custom providers', async () => {
    const options = 'custom' satisfies PiAuthenticationMode;
    const resolvedEnv = resolvePiEnv({
      options,
      env: {
        AI_GATEWAY_API_KEY: 'gw',
        OPENAI_API_KEY: 'oai',
        ANTHROPIC_API_KEY: 'ant',
        ANTHROPIC_AUTH_TOKEN: 'tok',
      },
    });
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
    const options = 'custom' satisfies PiAuthenticationMode;
    const resolvedEnv = resolvePiEnv({
      options,
      env: {
        MISTRAL_API_KEY: 'mk',
        MISTRAL_BASE_URL: 'https://api.mistral.example',
      },
    });
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
      headers: { 'x-tenant': 'acme' },
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
      headers: { 'x-tenant': 'acme' },
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
      headers: { 'x-tenant': 'acme' },
    });
    const providers = registries.registerProvider.mock.calls.map(c => c[0]);

    expect(providers).toEqual(['anthropic']);
    expect(registries.registerProvider).toHaveBeenCalledWith('anthropic', {
      apiKey: 'sk-ant',
      baseUrl: 'https://api.anthropic.com',
      headers: {
        'x-tenant': 'acme',
        authorization: 'Bearer tok',
      },
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
