import { APICallError, InvalidResponseDataError } from '@ai-sdk/provider';
import { expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { createOpenAI } from './openai-provider';

const fixture = JSON.parse(
  readFileSync('src/__fixtures__/evaluation.json', 'utf8'),
);

const options = {
  state: 'A billing issue with a workaround.',
  questions: {
    department: {
      type: 'choice',
      instructions: 'Pick the team.',
      criteria: { technical: 'Bugs', billing: 'Charges' },
    },
    severity: {
      type: 'score',
      instructions: 'Rate severity.',
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
  const provider = createOpenAI({
    apiKey: 'test-key',
    baseURL: 'https://example.com/v1',
    headers: { 'x-provider': 'configured' },
    fetch,
  });
  return { model: provider.evaluationModel('gpt-5.6-luna'), fetch };
}

it('evaluates through the configured Responses API with strict structured output', async () => {
  const { model, fetch } = setup();
  const result = await model.doEvaluate({
    ...options,
    headers: { 'x-call': 'forwarded' },
  });
  expect(model.provider).toBe('openai.evaluation');
  expect(model.supportedQuestionTypes).toEqual(['choice', 'score', 'boolean']);
  expect(result.answers).toEqual({
    department: { type: 'choice', choice: 'billing' },
    severity: { type: 'score', score: 1.25 },
  });
  expect(result.usage).toEqual({
    inputTokens: fixture.usage.input_tokens,
    outputTokens: fixture.usage.output_tokens,
  });
  expect(result.response?.headers?.['x-request-id']).toBe('req-test');
  expect(result.providerMetadata?.openai).toBeDefined();
  expect(fetch).toHaveBeenCalledTimes(1);
  const [url, request] = fetch.mock.calls[0];
  expect(url).toBe('https://example.com/v1/responses');
  expect(new Headers(request.headers).get('authorization')).toBe(
    'Bearer test-key',
  );
  expect(new Headers(request.headers).get('x-provider')).toBe('configured');
  expect(new Headers(request.headers).get('x-call')).toBe('forwarded');
  expect(JSON.parse(request.body)).toMatchObject({
    model: 'gpt-5.6-luna',
    reasoning: { effort: 'none' },
    text: {
      format: {
        type: 'json_schema',
        name: 'evaluation',
        strict: true,
        schema: {
          type: 'object',
          required: ['q0', 'q1'],
          additionalProperties: false,
          properties: {
            q0: { type: 'string', enum: ['c0', 'c1'] },
            q1: { type: 'number' },
          },
        },
      },
    },
  });
});

it('allows provider options to override the default reasoning effort', async () => {
  const { model, fetch } = setup();
  await model.doEvaluate({
    ...options,
    providerOptions: { openai: { reasoningEffort: 'high' } },
  });
  expect(JSON.parse(fetch.mock.calls[0][1].body).reasoning).toMatchObject({
    effort: 'high',
  });
});

it('evaluates Boolean alongside Choice and Score in one Responses request', async () => {
  const body = structuredClone(fixture);
  body.output[0].content[0].text = '{"q0":"c1","q1":1.25,"q2":0.02}';
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
    JSON.parse(fetch.mock.calls[0][1].body).text.format.schema,
  ).toMatchObject({
    properties: { q2: { type: 'number' } },
    required: ['q0', 'q1', 'q2'],
  });
});

it('rejects truncated output even when its text is valid JSON', async () => {
  const { model } = setup({
    ...fixture,
    status: 'incomplete',
    incomplete_details: { reason: 'max_output_tokens' },
  });
  await expect(model.doEvaluate(options)).rejects.toBeInstanceOf(
    InvalidResponseDataError,
  );
});

it('rejects a refusal instead of returning partial answers', async () => {
  const { model } = setup({
    ...fixture,
    output: [
      {
        type: 'message',
        id: 'msg-refusal',
        role: 'assistant',
        status: 'completed',
        content: [{ type: 'refusal', refusal: 'Cannot evaluate this.' }],
      },
    ],
  });
  await expect(model.doEvaluate(options)).rejects.toBeInstanceOf(APICallError);
});
