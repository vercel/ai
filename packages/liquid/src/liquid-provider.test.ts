import { LoadAPIKeyError, NoSuchModelError } from '@ai-sdk/provider';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createLiquid, liquid } from './liquid-provider';
import { VERSION } from './version';

const options = {
  state: 'A greeting.',
  questions: {
    greeting: { type: 'boolean' as const, instructions: 'Is this a greeting?' },
  },
};

const createFetchMock = () =>
  vi
    .fn<typeof fetch>()
    .mockResolvedValue(
      Response.json({ answers: { greeting: { type: 'noul', noul: 1 } } }),
    );

describe('Liquid provider', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it.each(['d1', 'd1:free', 'future-model'])(
    'provides decision model %s',
    modelId => {
      const model = liquid.decisionModel(modelId);
      expect(liquid.specificationVersion).toBe('v4');
      expect(model.specificationVersion).toBe('v4');
      expect(model.provider).toBe('liquid.decision');
      expect(model.modelId).toBe(modelId);
      expect(model.supportedQuestionTypes).toEqual([
        'choice',
        'score',
        'boolean',
      ]);
    },
  );

  it('provides the deprecated evaluation factory for older clients', async () => {
    const fetch = createFetchMock();
    const provider = createLiquid({ apiKey: 'test', fetch });
    expect(provider.evaluationModel).toBe(provider.decisionModel);
    await provider.evaluationModel('d1').doEvaluate(options);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it.each(['languageModel', 'embeddingModel', 'imageModel'] as const)(
    'rejects unsupported %s factories',
    factory => {
      expect(() => liquid[factory]('d1')).toThrow(NoSuchModelError);
    },
  );

  it('uses the default endpoint and lazily reads LIQUID_API_KEY', async () => {
    const fetch = createFetchMock();
    const model = createLiquid({ fetch }).decisionModel('d1');
    vi.stubEnv('LIQUID_API_KEY', 'environment-key');
    await model.doDecide(options);
    const [url, init] = fetch.mock.calls[0];
    expect(url).toBe('https://api.liquid.ai/decisions/v1/systemone');
    expect(new Headers(init?.headers).get('authorization')).toBe(
      'Bearer environment-key',
    );
    expect(new Headers(init?.headers).get('user-agent')).toContain(
      `ai-sdk-liquid/${VERSION}`,
    );
  });

  it('prefers an explicit API key and normalizes a custom base URL', async () => {
    vi.stubEnv('LIQUID_API_KEY', 'environment-key');
    const fetch = createFetchMock();
    await createLiquid({
      apiKey: 'custom-key',
      baseURL: 'https://proxy.example/decisions/v1/',
      headers: { custom: 'provider', shared: 'provider' },
      fetch,
    })
      .decisionModel('d1')
      .doDecide({ ...options, headers: { shared: 'call' } });
    const [url, init] = fetch.mock.calls[0];
    expect(url).toBe('https://proxy.example/decisions/v1/systemone');
    expect(new Headers(init?.headers).get('authorization')).toBe(
      'Bearer custom-key',
    );
    expect(new Headers(init?.headers).get('custom')).toBe('provider');
    expect(new Headers(init?.headers).get('shared')).toBe('call');
  });

  it('fails before HTTP when no API key is available', async () => {
    vi.stubEnv('LIQUID_API_KEY', undefined);
    const fetch = createFetchMock();
    await expect(
      createLiquid({ fetch }).decisionModel('d1').doDecide(options),
    ).rejects.toBeInstanceOf(LoadAPIKeyError);
    expect(fetch).not.toHaveBeenCalled();
  });
});
