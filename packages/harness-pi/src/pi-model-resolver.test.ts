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

const xaiModel: PiModel = {
  ...sampleModel,
  id: 'grok-4.3',
  name: 'Grok 4.3',
  provider: 'xai',
  baseUrl: 'https://api.x.ai',
};

const xaiProxiedThroughGateway: PiModel = {
  ...sampleModel,
  id: 'xai/grok-4.3',
  name: 'Grok 4.3 (gateway)',
  provider: 'vercel-ai-gateway',
  baseUrl: 'https://ai-gateway.vercel.sh',
};

const openaiModel: PiModel = {
  ...sampleModel,
  id: 'gpt-4o',
  name: 'GPT-4o',
  provider: 'openai',
  baseUrl: 'https://api.openai.com/v1',
};

const openaiProxiedThroughOpenRouter: PiModel = {
  ...sampleModel,
  id: 'openai/gpt-4o',
  name: 'OpenAI: GPT-4o',
  provider: 'openrouter',
  baseUrl: 'https://openrouter.ai/api/v1',
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

  it('resolves a compound provider/id reference to the entry under that provider', async () => {
    const resolve = createPiModelResolver({
      modelRegistry: await makeRegistry([xaiModel]),
      env: {},
    });
    expect(resolve('xai/grok-4.3')).toEqual(xaiModel);
  });

  it('resolves a compound provider/name reference', async () => {
    const resolve = createPiModelResolver({
      modelRegistry: await makeRegistry([xaiModel]),
      env: {},
    });
    expect(resolve('xai/Grok 4.3')).toEqual(xaiModel);
  });

  it('prefers the scoped provider match over a proxy entry whose flat id collides', async () => {
    const resolve = createPiModelResolver({
      modelRegistry: await makeRegistry([xaiModel, xaiProxiedThroughGateway]),
      env: {},
    });
    expect(resolve('xai/grok-4.3')).toEqual(xaiModel);
  });

  it('prefers the scoped provider match over a proxy entry regardless of catalog order', async () => {
    const resolve = createPiModelResolver({
      modelRegistry: await makeRegistry([xaiProxiedThroughGateway, xaiModel]),
      env: {},
    });
    expect(resolve('xai/grok-4.3')).toEqual(xaiModel);
  });

  it('prefers an authenticated proxy entry over an unauthenticated scoped provider match', async () => {
    const modelRegistry = await makeRegistry([
      openaiModel,
      openaiProxiedThroughOpenRouter,
    ]);
    vi.spyOn(modelRegistry, 'hasConfiguredAuth').mockImplementation(
      model => model.provider === 'openrouter',
    );
    const resolve = createPiModelResolver({ modelRegistry, env: {} });

    expect(resolve('openai/gpt-4o')).toEqual(openaiProxiedThroughOpenRouter);
  });

  it('prefers the gateway entry over the scoped native provider when gateway creds are present', async () => {
    const resolve = createPiModelResolver({
      modelRegistry: await makeRegistry([xaiModel, xaiProxiedThroughGateway]),
      env: { AI_GATEWAY_API_KEY: 'sk-test' },
    });
    expect(resolve('xai/grok-4.3')).toEqual(xaiProxiedThroughGateway);
  });

  it('prefers the gateway entry over the scoped native provider regardless of catalog order', async () => {
    const resolve = createPiModelResolver({
      modelRegistry: await makeRegistry([xaiProxiedThroughGateway, xaiModel]),
      env: { AI_GATEWAY_API_KEY: 'sk-test' },
    });
    expect(resolve('xai/grok-4.3')).toEqual(xaiProxiedThroughGateway);
  });

  it('falls back to the scoped native provider when gateway creds are present but the gateway carries nothing for it', async () => {
    const resolve = createPiModelResolver({
      modelRegistry: await makeRegistry([xaiModel]),
      env: { AI_GATEWAY_API_KEY: 'sk-test' },
    });
    expect(resolve('xai/grok-4.3')).toEqual(xaiModel);
  });

  it('falls through to flat matching when the id prefix is not a known provider', async () => {
    const resolve = createPiModelResolver({
      modelRegistry: await makeRegistry([xaiProxiedThroughGateway]),
      env: {},
    });
    // "xai" is not a provider in this catalog, so "xai/grok-4.3" cannot be
    // scoped-matched and must fall back to a flat id match instead.
    expect(resolve('xai/grok-4.3')).toEqual(xaiProxiedThroughGateway);
  });

  it('still prefers the gateway entry over other flat matches when there is no scoped match', async () => {
    const openrouterModel: PiModel = {
      ...defaultGatewayModel,
      provider: 'openrouter',
    };
    const resolve = createPiModelResolver({
      modelRegistry: await makeRegistry([openrouterModel, defaultGatewayModel]),
      env: { AI_GATEWAY_API_KEY: 'sk-test' },
    });
    expect(resolve(DEFAULT_PI_GATEWAY_MODEL_ID)).toEqual(defaultGatewayModel);
  });
});
