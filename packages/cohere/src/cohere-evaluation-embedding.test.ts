import { Experimental_EvaluationUnsupportedQuestionTypeError as EvaluationUnsupportedQuestionTypeError } from '@ai-sdk/provider';
import { expect, it, vi } from 'vitest';
import { createCohere } from './cohere-provider';

const options = {
  state: 'charged twice',
  questions: {
    department: {
      type: 'choice',
      instructions: 'Pick the team',
      criteria: { technical: 'Bugs', billing: 'Charges' },
    },
  },
} as const;

function setup(modelId = 'embed-v4.0') {
  const fetch = vi
    .fn<typeof globalThis.fetch>()
    .mockImplementation(async (_url, init) => {
      const body = JSON.parse(init!.body as string);
      return Response.json({
        embeddings: {
          float: body.texts.map((value: string) =>
            value.includes('Bugs') ? [0, 10] : [1, 0],
          ),
        },
        meta: { billed_units: { input_tokens: 12 } },
      });
    });
  const provider = createCohere({
    apiKey: 'test-key',
    baseURL: 'https://example.com',
    headers: { 'x-provider': 'configured' },
    fetch,
  });
  return { model: provider.evaluationModel(modelId), fetch };
}

it('routes embed-v4.0 to embeddings, preserves usage, and caches criteria', async () => {
  const { model, fetch } = setup();
  const abortSignal = new AbortController().signal;
  const result = await model.doEvaluate({
    ...options,
    abortSignal,
    headers: { 'x-call': 'forwarded' },
    providerOptions: { cohere: { outputDimension: 256 } },
  });
  expect(model.supportedQuestionTypes).toEqual(['choice']);
  expect(model.provider).toBe('cohere.evaluation');
  expect(model.modelId).toBe('embed-v4.0');
  expect(result.answers).toEqual({
    department: { type: 'choice', choice: 'billing' },
  });
  expect(result.usage).toEqual({ inputTokens: 12, outputTokens: 0 });
  const [url, request] = fetch.mock.calls[0];
  expect(String(url)).toBe('https://example.com/embed');
  expect(request!.signal).toBe(abortSignal);
  expect(new Headers(request!.headers).get('x-provider')).toBe('configured');
  expect(new Headers(request!.headers).get('x-call')).toBe('forwarded');
  const body = JSON.parse(request!.body as string);
  expect(body).toMatchObject({
    model: 'embed-v4.0',
    input_type: 'classification',
    truncate: 'NONE',
    output_dimension: 256,
  });
  expect(body.texts).toHaveLength(3);
  // A separate context first populates a cache with no per-call options.
  await model.doEvaluate(options);
  await model.doEvaluate(options);
  const warm = JSON.parse(fetch.mock.calls[2][1]!.body as string);
  expect(warm.texts).toHaveLength(1);
});
it.each(['boolean', 'score'] as const)(
  'rejects a mixed %s request before I/O',
  async type => {
    const { model, fetch } = setup();
    await expect(
      model.doEvaluate({
        ...options,
        questions: {
          ...options.questions,
          unsupported:
            type === 'boolean'
              ? { type, instructions: 'Is it true?' }
              : { type, instructions: 'Rate it', criteria: ['low', 'high'] },
        },
      }),
    ).rejects.toBeInstanceOf(EvaluationUnsupportedQuestionTypeError);
    expect(fetch).not.toHaveBeenCalled();
  },
);
