import { APICallError, type EmbeddingModelV4 } from '@ai-sdk/provider';
import { Experimental_EvaluationEmbeddingModel as EvaluationEmbeddingModel } from '@ai-sdk/provider-utils/experimental-evaluation';
import { afterEach, expect, it, vi } from 'vitest';
import { createProviderRegistry } from '../registry/provider-registry';
import { customProvider } from '../registry/custom-provider';
import { evaluate } from './evaluate';

afterEach(() => vi.unstubAllGlobals());

const questions = {
  department: {
    type: 'choice',
    instructions: 'Pick the team',
    criteria: { technical: 'Bugs', billing: 'Charges' },
  },
} as const;

function setup() {
  const doEmbed = vi
    .fn<EmbeddingModelV4['doEmbed']>()
    .mockImplementation(async ({ values }) => ({
      embeddings: values.map(value =>
        value.includes('Bugs') ? [0, 1] : [1, 0],
      ),
      warnings: [],
      usage: { tokens: values.length },
    }));
  const model = new EvaluationEmbeddingModel({
    model: {
      specificationVersion: 'v4',
      provider: 'test.embedding',
      modelId: 'embedding',
      maxEmbeddingsPerCall: 100,
      supportsParallelCalls: true,
      doEmbed,
    },
  });
  return { model, doEmbed };
}

it('evaluates embedding models through custom aliases, registries, and default-provider strings', async () => {
  const { model, doEmbed } = setup();
  const provider = customProvider({ evaluationModels: { routing: model } });
  const registry = createProviderRegistry({ test: provider });
  vi.stubGlobal('AI_SDK_DEFAULT_PROVIDER', provider);
  for (const model of [
    provider.evaluationModel('routing'),
    registry.evaluationModel('test:routing'),
    'routing',
  ]) {
    const result = await evaluate({ model, state: 'charged twice', questions });
    expect(result.answers.department).toEqual({
      type: 'choice',
      choice: 'billing',
    });
  }
  expect(doEmbed.mock.calls.map(([call]) => call.values.length)).toEqual([
    3, 1, 1,
  ]);
});

it('retries transient embedding failures in core and returns complete answers', async () => {
  const { model, doEmbed } = setup();
  doEmbed.mockRejectedValueOnce(
    new APICallError({
      message: 'try again',
      url: 'https://example.com/embed',
      requestBodyValues: {},
      statusCode: 429,
      isRetryable: true,
    }),
  );
  const result = await evaluate({
    model,
    state: 'charged twice',
    questions,
    maxRetries: 1,
  });
  expect(result.answers.department).toEqual({
    type: 'choice',
    choice: 'billing',
  });
  expect(doEmbed).toHaveBeenCalledTimes(2);
});
