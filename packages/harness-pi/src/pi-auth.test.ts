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

afterEach(async () => {
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
    const registries = await registerProviders({
      options: undefined,
      resolvedEnv: {},
    });

    expect(registries.setRuntimeApiKey).not.toHaveBeenCalled();
    expect(registries.registerProvider).not.toHaveBeenCalled();
  });
});
