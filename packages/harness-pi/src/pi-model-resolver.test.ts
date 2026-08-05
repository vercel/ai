import { ModelRegistry, ModelRuntime } from '@earendil-works/pi-coding-agent';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import {
  createPiModelResolver,
  DEFAULT_PI_GATEWAY_MODEL_ID,
} from './pi-model-resolver';

type PiModel = ReturnType<ModelRegistry['getAll']>[number];

async function makeRegistry(models: PiModel[] = []) {
  const modelRuntime = await ModelRuntime.create({
    authPath: path.join(tmpdir(), `harness-pi-model-${randomUUID()}.json`),
    modelsPath: null,
    allowModelNetwork: false,
  });
  const registry = new ModelRegistry(modelRuntime);
  vi.spyOn(registry, 'getAll').mockReturnValue(models);
  return registry;
}

const sampleModel: PiModel = {
  id: 'my/model',
  name: 'My Model',
  api: 'anthropic-messages',
  provider: 'example',
  baseUrl: 'https://example.test',
  reasoning: false,
  input: ['text'],
  cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
  contextWindow: 100_000,
  maxTokens: 4_096,
};

const defaultGatewayModel: PiModel = {
  ...sampleModel,
  id: DEFAULT_PI_GATEWAY_MODEL_ID,
  name: 'Claude Sonnet 4.6',
  provider: 'vercel-ai-gateway',
  baseUrl: 'https://ai-gateway.vercel.sh',
};

describe('createPiModelResolver', () => {
  it('returns matching model by id', async () => {
    const resolve = createPiModelResolver({
      modelRegistry: await makeRegistry([sampleModel]),
      env: {},
    });
    expect(resolve('my/model')).toEqual(sampleModel);
  });

  it('returns matching model by name', async () => {
    const resolve = createPiModelResolver({
      modelRegistry: await makeRegistry([sampleModel]),
      env: {},
    });
    expect(resolve('My Model')).toEqual(sampleModel);
  });

  it('looks up the gateway default when no id and AI_GATEWAY_API_KEY is set', async () => {
    const resolve = createPiModelResolver({
      modelRegistry: await makeRegistry([defaultGatewayModel]),
      env: {
        AI_GATEWAY_API_KEY: 'sk-test',
      },
    });
    expect(resolve(undefined)).toEqual(defaultGatewayModel);
  });

  it('looks up the gateway default when VERCEL_OIDC_TOKEN is set', async () => {
    const resolve = createPiModelResolver({
      modelRegistry: await makeRegistry([defaultGatewayModel]),
      env: {
        VERCEL_OIDC_TOKEN: 'oidc-token',
      },
    });
    expect(resolve(undefined)).toEqual(defaultGatewayModel);
  });

  it('returns undefined for unknown model id', async () => {
    const resolve = createPiModelResolver({
      modelRegistry: await makeRegistry([sampleModel]),
      env: { AI_GATEWAY_API_KEY: 'sk-test' },
    });
    expect(resolve('unknown')).toBeUndefined();
  });

  it('returns undefined when no model id and no gateway creds', async () => {
    const resolve = createPiModelResolver({
      modelRegistry: await makeRegistry([sampleModel]),
      env: {},
    });
    expect(resolve(undefined)).toBeUndefined();
  });

  it('returns undefined when gateway default id is missing from the registry', async () => {
    const resolve = createPiModelResolver({
      modelRegistry: await makeRegistry([sampleModel]),
      env: { AI_GATEWAY_API_KEY: 'sk-test' },
    });
    expect(resolve(undefined)).toBeUndefined();
  });

  describe('customEnv-registered providers', () => {
    const customProviderConfig = {
      apiKey: 'sk-test',
      baseUrl: 'https://my.provider.example/v1',
      authHeader: true,
      api: 'openai-completions',
    } as const;

    it('prefers a registered provider over an unregistered one sharing the model id', async () => {
      const registeredModel: PiModel = {
        ...sampleModel,
        provider: 'my-provider',
        baseUrl: customProviderConfig.baseUrl,
      };
      const modelRegistry = await makeRegistry([sampleModel, registeredModel]);
      modelRegistry.registerProvider('my-provider', customProviderConfig);
      const resolve = createPiModelResolver({ modelRegistry, env: {} });
      expect(resolve('my/model')).toEqual(registeredModel);
    });

    it('dispatches an uncataloged model id through the single registered custom provider', async () => {
      const modelRegistry = await makeRegistry([sampleModel]);
      modelRegistry.registerProvider('my-provider', customProviderConfig);
      const resolve = createPiModelResolver({ modelRegistry, env: {} });
      expect(resolve('my-custom-model')).toEqual({
        id: 'my-custom-model',
        name: 'my-custom-model',
        api: 'openai-completions',
        provider: 'my-provider',
        baseUrl: customProviderConfig.baseUrl,
        reasoning: false,
        input: ['text'],
        cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
        contextWindow: 128_000,
        maxTokens: 16_384,
      });
    });

    it('does not synthesize a model when multiple custom providers are registered', async () => {
      const modelRegistry = await makeRegistry([sampleModel]);
      modelRegistry.registerProvider('my-provider', customProviderConfig);
      modelRegistry.registerProvider('other-provider', {
        ...customProviderConfig,
        baseUrl: 'https://other.provider.example/v1',
      });
      const resolve = createPiModelResolver({ modelRegistry, env: {} });
      expect(resolve('my-custom-model')).toBeUndefined();
    });

    it('does not synthesize a model for providers without a declared api', async () => {
      const modelRegistry = await makeRegistry([sampleModel]);
      modelRegistry.registerProvider('my-provider', {
        apiKey: 'sk-test',
        baseUrl: customProviderConfig.baseUrl,
        authHeader: true,
      });
      const resolve = createPiModelResolver({ modelRegistry, env: {} });
      expect(resolve('my-custom-model')).toBeUndefined();
    });

    it('does not synthesize a model for the gateway default model id', async () => {
      const modelRegistry = await makeRegistry([sampleModel]);
      modelRegistry.registerProvider('my-provider', customProviderConfig);
      const resolve = createPiModelResolver({
        modelRegistry,
        env: { AI_GATEWAY_API_KEY: 'sk-test' },
      });
      expect(resolve(undefined)).toBeUndefined();
    });
  });
});
