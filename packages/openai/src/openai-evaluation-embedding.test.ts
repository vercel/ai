import { Experimental_EvaluationUnsupportedQuestionTypeError as EvaluationUnsupportedQuestionTypeError } from '@ai-sdk/provider';
import { expect, it, vi } from 'vitest';
import { createOpenAI } from './openai-provider';

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

function setup(
  modelId = 'text-embedding-3-large',
  modelType?: 'language' | 'embedding',
) {
  const fetch = vi
    .fn<typeof globalThis.fetch>()
    .mockImplementation(async (_url, init) => {
      const body = JSON.parse(init!.body as string);
      return Response.json({
        data: body.input.map((value: string, index: number) => ({
          index,
          embedding: value.includes('Bugs') ? [0, 10] : [1, 0],
        })),
        usage: { prompt_tokens: 12, total_tokens: 12 },
      });
    });
  const provider = createOpenAI({
    apiKey: 'test-key',
    baseURL: 'https://example.com',
    headers: { 'x-provider': 'configured' },
    fetch,
  });
  return { model: provider.evaluationModel(modelId, { modelType }), fetch };
}

it('routes text-embedding-3-large to embeddings, preserves usage, and caches criteria', async () => {
  const { model, fetch } = setup();
  const abortSignal = new AbortController().signal;
  const result = await model.doEvaluate({
    ...options,
    abortSignal,
    headers: { 'x-call': 'forwarded' },
    providerOptions: { openai: { dimensions: 2 } },
  });
  expect(model.supportedQuestionTypes).toEqual(['choice']);
  expect(model.provider).toBe('openai.evaluation');
  expect(model.modelId).toBe('text-embedding-3-large');
  expect(result.answers).toEqual({
    department: { type: 'choice', choice: 'billing' },
  });
  expect(result.usage).toEqual({ inputTokens: 12, outputTokens: 0 });
  const [url, request] = fetch.mock.calls[0];
  expect(String(url)).toBe('https://example.com/embeddings');
  expect(request!.signal).toBe(abortSignal);
  expect(new Headers(request!.headers).get('x-provider')).toBe('configured');
  expect(new Headers(request!.headers).get('x-call')).toBe('forwarded');
  const body = JSON.parse(request!.body as string);
  expect(body).toMatchObject({
    model: 'text-embedding-3-large',
    dimensions: 2,
  });
  expect(body.input).toHaveLength(3);
  // A separate context first populates a cache with no per-call options.
  await model.doEvaluate(options);
  await model.doEvaluate(options);
  const warm = JSON.parse(fetch.mock.calls[2][1]!.body as string);
  expect(warm.input).toHaveLength(1);
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
it('allows an explicit embedding backend for custom model IDs', async () => {
  const { model, fetch } = setup('custom-embedding-deployment', 'embedding');
  await model.doEvaluate(options);
  expect(model.supportedQuestionTypes).toEqual(['choice']);
  expect(fetch).toHaveBeenCalledTimes(1);
});
it('retains language evaluation for existing and custom language IDs', () => {
  const provider = createOpenAI({ apiKey: 'test' });
  expect(
    provider.evaluationModel('gpt-5.6-luna').supportedQuestionTypes,
  ).toEqual(['choice', 'score', 'boolean']);
  expect(
    provider.evaluationModel('custom-language-id').supportedQuestionTypes,
  ).toEqual(['choice', 'score', 'boolean']);
});
