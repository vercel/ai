import { Experimental_EvaluationUnsupportedQuestionTypeError as EvaluationUnsupportedQuestionTypeError } from '@ai-sdk/provider';
import { expect, it, vi } from 'vitest';
import { createGoogle } from './google-provider';

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
  modelId = 'gemini-embedding-2',
  modelType?: 'language' | 'embedding',
) {
  const fetch = vi
    .fn<typeof globalThis.fetch>()
    .mockImplementation(async (_url, init) => {
      const body = JSON.parse(init!.body as string);
      const values = body.requests
        ? body.requests.map(
            (request: { content: { parts: { text: string }[] } }) =>
              request.content.parts[0].text,
          )
        : [body.content.parts[0].text];
      const embeddings = values.map((value: string) => ({
        values: value.includes('Bugs') ? [0, 10] : [1, 0],
      }));
      return Response.json({
        ...(body.requests ? { embeddings } : { embedding: embeddings[0] }),
        usageMetadata: { promptTokenCount: 12 },
      });
    });
  const provider = createGoogle({
    apiKey: 'test-key',
    baseURL: 'https://example.com',
    headers: { 'x-provider': 'configured' },
    fetch,
  });
  return { model: provider.evaluationModel(modelId, { modelType }), fetch };
}

it('routes gemini-embedding-2 to embeddings, preserves usage, and caches criteria', async () => {
  const { model, fetch } = setup();
  const abortSignal = new AbortController().signal;
  const result = await model.doEvaluate({
    ...options,
    abortSignal,
    headers: { 'x-call': 'forwarded' },
    providerOptions: { google: { outputDimensionality: 2 } },
  });
  expect(model.supportedQuestionTypes).toEqual(['choice']);
  expect(model.provider).toBe('google.evaluation');
  expect(model.modelId).toBe('gemini-embedding-2');
  expect(result.answers).toEqual({
    department: { type: 'choice', choice: 'billing' },
  });
  expect(result.usage).toEqual({ inputTokens: 12, outputTokens: 0 });
  const [url, request] = fetch.mock.calls[0];
  expect(String(url)).toBe(
    'https://example.com/models/gemini-embedding-2:batchEmbedContents',
  );
  expect(request!.signal).toBe(abortSignal);
  expect(new Headers(request!.headers).get('x-provider')).toBe('configured');
  expect(new Headers(request!.headers).get('x-call')).toBe('forwarded');
  const body = JSON.parse(request!.body as string);
  expect(body.requests).toHaveLength(3);
  expect(body.requests[0]).toMatchObject({
    outputDimensionality: 2,
    content: {
      parts: [
        {
          text:
            'task: classification | query: ' +
            JSON.stringify({
              instructions: 'Pick the team',
              content: 'charged twice',
            }),
        },
      ],
    },
  });
  expect(body.requests[0]).not.toHaveProperty('taskType');
  // A separate context first populates a cache with no per-call options.
  await model.doEvaluate(options);
  await model.doEvaluate(options);
  const warm = JSON.parse(fetch.mock.calls[2][1]!.body as string);
  expect(warm).toHaveProperty('content');
  expect(warm).not.toHaveProperty('requests');
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
  const provider = createGoogle({ apiKey: 'test' });
  expect(
    provider.evaluationModel('gemini-3.5-flash-lite').supportedQuestionTypes,
  ).toEqual(['choice', 'score', 'boolean']);
  expect(
    provider.evaluationModel('custom-language-id').supportedQuestionTypes,
  ).toEqual(['choice', 'score', 'boolean']);
});
