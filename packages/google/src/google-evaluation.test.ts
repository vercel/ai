import { InvalidResponseDataError } from '@ai-sdk/provider';
import { readFileSync } from 'node:fs';
import { expect, it, vi } from 'vitest';
import { createGoogle } from './google-provider';

const fixture = JSON.parse(
  readFileSync('src/__fixtures__/evaluation.json', 'utf8'),
);
const options = {
  state: { message: 'A billing issue with a workaround.' },
  questions: {
    department: {
      type: 'choice',
      instructions: 'Pick the team.',
      criteria: { technical: 'Bugs', billing: 'Charges' },
    },
    severity: {
      type: 'score',
      instructions: ['Rate severity.'],
      criteria: ['Low', 'Medium', 'High'],
    },
  },
} as const;
function setup(body: unknown = fixture) {
  const fetch = vi.fn().mockImplementation(
    async () =>
      new Response(JSON.stringify(body), {
        headers: {
          'content-type': 'application/json',
          'x-request-id': 'req-test',
        },
      }),
  );
  const provider = createGoogle({
    apiKey: 'test-key',
    baseURL: 'https://example.com/v1beta',
    headers: { 'x-provider': 'configured' },
    fetch,
  });
  return { model: provider.evaluationModel('gemini-3.5-flash-lite'), fetch };
}

it('uses Gemini structured output and forwards thinking options and cancellation', async () => {
  const { model, fetch } = setup();
  const abortSignal = new AbortController().signal;
  const result = await model.doEvaluate({
    ...options,
    abortSignal,
    headers: { 'x-call': 'forwarded' },
    providerOptions: {
      google: { thinkingConfig: { thinkingLevel: 'high' } },
    },
  });
  expect(model.provider).toBe('google.evaluation');
  expect(model.supportedQuestionTypes).toEqual(['choice', 'score', 'boolean']);
  expect(result.answers).toEqual({
    department: { type: 'choice', choice: 'billing' },
    severity: { type: 'score', score: 1.25 },
  });
  expect(result.usage).toEqual({
    inputTokens: fixture.usageMetadata.promptTokenCount,
    outputTokens: fixture.usageMetadata.candidatesTokenCount,
  });
  expect(result.response?.headers?.['x-request-id']).toBe('req-test');
  expect(model.modelId).toBe('gemini-3.5-flash-lite');
  expect(result.response?.id).toBe(fixture.responseId);
  expect(result.providerMetadata?.google).toBeDefined();
  expect(fetch).toHaveBeenCalledTimes(1);
  const [url, request] = fetch.mock.calls[0];
  expect(url).toBe(
    'https://example.com/v1beta/models/gemini-3.5-flash-lite:generateContent',
  );
  expect(request.signal).toBe(abortSignal);
  expect(new Headers(request.headers).get('x-goog-api-key')).toBe('test-key');
  expect(new Headers(request.headers).get('x-provider')).toBe('configured');
  expect(new Headers(request.headers).get('x-call')).toBe('forwarded');
  const body = JSON.parse(request.body);
  expect(body.generationConfig).toMatchObject({
    responseMimeType: 'application/json',
    thinkingConfig: { thinkingLevel: 'high' },
    responseJsonSchema: {
      type: 'object',
      properties: {
        q0: { type: 'string', enum: ['c0', 'c1'] },
        q1: { type: 'number' },
      },
      required: ['q0', 'q1'],
      additionalProperties: false,
    },
  });
  expect(
    body.generationConfig.responseJsonSchema.properties.q1,
  ).not.toHaveProperty('minimum');
  expect(
    body.generationConfig.responseJsonSchema.properties.q1,
  ).not.toHaveProperty('maximum');
});
it('defaults to the minimum thinking level through the provider reasoning mapping', async () => {
  const { model, fetch } = setup();
  await model.doEvaluate(options);
  expect(
    JSON.parse(fetch.mock.calls[0][1].body).generationConfig.thinkingConfig,
  ).toEqual({ thinkingLevel: 'minimal' });
});
it('ignores thought text while counting reasoning tokens in usage', async () => {
  const { model } = setup({
    ...fixture,
    candidates: [
      {
        ...fixture.candidates[0],
        content: {
          role: 'model',
          parts: [
            { thought: true, text: 'Internal reasoning' },
            ...fixture.candidates[0].content.parts,
          ],
        },
      },
    ],
    usageMetadata: {
      ...fixture.usageMetadata,
      thoughtsTokenCount: 10,
      totalTokenCount: fixture.usageMetadata.totalTokenCount + 10,
    },
  });
  const result = await model.doEvaluate(options);
  expect(result.answers.severity).toEqual({ type: 'score', score: 1.25 });
  expect(result.usage?.outputTokens).toBe(
    fixture.usageMetadata.candidatesTokenCount + 10,
  );
});
it.each(['SAFETY', 'MAX_TOKENS'])(
  'rejects %s even with valid JSON',
  async finishReason => {
    const { model } = setup({
      ...fixture,
      candidates: [{ ...fixture.candidates[0], finishReason }],
    });
    await expect(model.doEvaluate(options)).rejects.toBeInstanceOf(
      InvalidResponseDataError,
    );
  },
);
it('validates score bounds locally', async () => {
  const { model } = setup({
    ...fixture,
    candidates: [
      {
        ...fixture.candidates[0],
        content: { role: 'model', parts: [{ text: '{"q0":"c1","q1":3}' }] },
      },
    ],
  });
  await expect(model.doEvaluate(options)).rejects.toBeInstanceOf(
    InvalidResponseDataError,
  );
});
it('evaluates Boolean alongside Choice and Score in one Gemini request', async () => {
  const body = structuredClone(fixture);
  body.candidates[0].content.parts = [
    { text: '{"q0":"c1","q1":1.25,"q2":0.02}' },
  ];
  const { model, fetch } = setup(body);
  const result = await model.doEvaluate({
    ...options,
    questions: {
      ...options.questions,
      flag: { type: 'boolean', instructions: 'Is a refund requested?' },
    },
  });
  expect(result.answers).toEqual({
    department: { type: 'choice', choice: 'billing' },
    severity: { type: 'score', score: 1.25 },
    flag: { type: 'boolean', probability: 0.02 },
  });
  expect(fetch).toHaveBeenCalledTimes(1);
  expect(
    JSON.parse(fetch.mock.calls[0][1].body).generationConfig.responseJsonSchema,
  ).toMatchObject({
    properties: { q2: { type: 'number' } },
    required: ['q0', 'q1', 'q2'],
  });
});
it('rejects an aborted evaluation without a request', async () => {
  const { model, fetch } = setup();
  const reason = new Error('cancelled');
  await expect(
    model.doEvaluate({ ...options, abortSignal: AbortSignal.abort(reason) }),
  ).rejects.toBe(reason);
  expect(fetch).not.toHaveBeenCalled();
});
