import { NoSuchModelError } from '@ai-sdk/provider';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createTypeSafeAi, typeSafeAi } from './typesafe-ai-provider';

const evaluationOptions = {
  state: 'The request used the configured endpoint.',
  questions: {
    configured: {
      type: 'boolean' as const,
      instructions: 'Did the request use the configured endpoint?',
    },
  },
};

const createFetchMock = () =>
  vi.fn<typeof fetch>().mockResolvedValue(
    Response.json({
      model: 'jev-latest',
      answers: {
        configured: {
          type: 'noul',
          noul: 1,
        },
      },
    }),
  );

describe('TypeSafe provider', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  it('provides the experimental evaluation capability', () => {
    const model = typeSafeAi.evaluationModel('jev-latest');
    expect(typeSafeAi.specificationVersion).toBe('v4');
    expect(model.specificationVersion).toBe('v4');
    expect(model.provider).toBe('typesafe.evaluation');
    expect(model.modelId).toBe('jev-latest');
    expect(model.supportedQuestionTypes).toEqual([
      'choice',
      'score',
      'boolean',
    ]);
  });

  it.each(['languageModel', 'embeddingModel', 'imageModel'] as const)(
    'rejects unsupported %s factories',
    factory => {
      expect(() => createTypeSafeAi()[factory]('unknown')).toThrow(
        NoSuchModelError,
      );
    },
  );

  it('uses the default base URL when TYPESAFE_AI_BASE_URL is not set', async () => {
    vi.stubEnv('TYPESAFE_AI_BASE_URL', undefined);
    const fetch = createFetchMock();

    await createTypeSafeAi({ apiKey: 'test-api-key', fetch })
      .evaluationModel('jev-latest')
      .doEvaluate(evaluationOptions);

    expect(fetch).toHaveBeenCalledTimes(1);
    expect(fetch.mock.calls[0][0]).toBe('https://api.typesafe.ai/v1/systemone');
  });

  it('uses TYPESAFE_AI_BASE_URL without a trailing slash', async () => {
    vi.stubEnv('TYPESAFE_AI_BASE_URL', 'https://proxy.example/v1/');
    const fetch = createFetchMock();

    await createTypeSafeAi({ apiKey: 'test-api-key', fetch })
      .evaluationModel('jev-latest')
      .doEvaluate(evaluationOptions);

    expect(fetch).toHaveBeenCalledTimes(1);
    expect(fetch.mock.calls[0][0]).toBe('https://proxy.example/v1/systemone');
  });

  it('prefers the baseURL option over TYPESAFE_AI_BASE_URL', async () => {
    vi.stubEnv('TYPESAFE_AI_BASE_URL', 'https://environment.example/v1');
    const fetch = createFetchMock();

    await createTypeSafeAi({
      apiKey: 'test-api-key',
      baseURL: 'https://option.example/v1/',
      fetch,
    })
      .evaluationModel('jev-latest')
      .doEvaluate(evaluationOptions);

    expect(fetch).toHaveBeenCalledTimes(1);
    expect(fetch.mock.calls[0][0]).toBe('https://option.example/v1/systemone');
  });

  it('configures the default provider from TYPESAFE_AI_BASE_URL at import time', async () => {
    vi.stubEnv('TYPESAFE_AI_API_KEY', 'test-api-key');
    vi.stubEnv('TYPESAFE_AI_BASE_URL', 'https://singleton.example/v1/');
    const fetch = vi
      .spyOn(globalThis, 'fetch')
      .mockImplementation(createFetchMock());
    vi.resetModules();

    const { typeSafeAi: environmentTypeSafeAi } =
      await import('./typesafe-ai-provider');
    await environmentTypeSafeAi
      .evaluationModel('jev-latest')
      .doEvaluate(evaluationOptions);

    expect(fetch).toHaveBeenCalledTimes(1);
    expect(fetch.mock.calls[0][0]).toBe(
      'https://singleton.example/v1/systemone',
    );
  });
});
