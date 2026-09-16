import { InvalidResponseDataError } from '@ai-sdk/provider';
import { readFileSync } from 'node:fs';
import { expect, it, vi } from 'vitest';
import { createAnthropic } from './anthropic-provider';

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
          'request-id': 'req-test',
        },
      }),
  );
  const provider = createAnthropic({
    apiKey: 'test-key',
    baseURL: 'https://example.com/v1',
    headers: { 'x-provider': 'configured' },
    fetch,
  });
  return {
    model: provider.evaluationModel('claude-haiku-4-5-20251001'),
    fetch,
  };
}

it('uses native Messages output with portable constraints and configured settings', async () => {
  const { model, fetch } = setup();
  const result = await model.doEvaluate({
    ...options,
    headers: { 'x-call': 'forwarded' },
    providerOptions: { anthropic: { structuredOutputMode: 'outputFormat' } },
  });
  expect(model.provider).toBe('anthropic.evaluation');
  expect(model.supportedQuestionTypes).toEqual(['choice', 'score', 'boolean']);
  expect(result.answers).toEqual({
    department: { type: 'choice', choice: 'billing' },
    severity: { type: 'score', score: 1.25 },
  });
  expect(result.usage).toEqual({
    inputTokens: fixture.usage.input_tokens,
    outputTokens: fixture.usage.output_tokens,
  });
  expect(result.response?.headers?.['request-id']).toBe('req-test');
  expect(result.providerMetadata?.anthropic).toBeDefined();
  expect(fetch).toHaveBeenCalledTimes(1);
  const [url, request] = fetch.mock.calls[0];
  expect(url).toBe('https://example.com/v1/messages');
  expect(new Headers(request.headers).get('x-api-key')).toBe('test-key');
  expect(new Headers(request.headers).get('x-provider')).toBe('configured');
  expect(new Headers(request.headers).get('x-call')).toBe('forwarded');
  const body = JSON.parse(request.body);
  expect(body).toMatchObject({
    model: 'claude-haiku-4-5-20251001',
    output_config: {
      format: {
        type: 'json_schema',
        schema: {
          type: 'object',
          properties: {
            q0: { type: 'string', enum: ['c0', 'c1'] },
            q1: { type: 'number' },
          },
          required: ['q0', 'q1'],
          additionalProperties: false,
        },
      },
    },
  });
  expect(body.output_config.format.schema.properties.q1).not.toHaveProperty(
    'minimum',
  );
  expect(body.output_config.format.schema.properties.q1).not.toHaveProperty(
    'maximum',
  );
});
it('selects native structured output automatically for supported models', async () => {
  const { model, fetch } = setup();
  await model.doEvaluate(options);
  expect(JSON.parse(fetch.mock.calls[0][1].body)).toHaveProperty(
    'output_config.format.type',
    'json_schema',
  );
});
it('supports the existing JSON-tool fallback through provider options', async () => {
  const { model, fetch } = setup({
    ...fixture,
    stop_reason: 'tool_use',
    content: [
      {
        type: 'tool_use',
        id: 'tool-test',
        name: 'json',
        input: { q0: 'c1', q1: 1.25 },
      },
    ],
  });
  const result = await model.doEvaluate({
    ...options,
    providerOptions: { anthropic: { structuredOutputMode: 'jsonTool' } },
  });
  expect(result.answers.department).toEqual({
    type: 'choice',
    choice: 'billing',
  });
  const body = JSON.parse(fetch.mock.calls[0][1].body);
  expect(body).not.toHaveProperty('output_config.format');
  expect(body.tool_choice).toMatchObject({
    type: 'any',
    disable_parallel_tool_use: true,
  });
  expect(body.tools).toEqual([expect.objectContaining({ name: 'json' })]);
});
it.each(['refusal', 'max_tokens'])(
  'rejects %s even with valid JSON',
  async stop_reason => {
    const { model } = setup({ ...fixture, stop_reason });
    await expect(model.doEvaluate(options)).rejects.toBeInstanceOf(
      InvalidResponseDataError,
    );
  },
);
it('validates score bounds locally', async () => {
  const { model } = setup({
    ...fixture,
    content: [{ type: 'text', text: '{"q0":"c1","q1":3}' }],
  });
  await expect(model.doEvaluate(options)).rejects.toBeInstanceOf(
    InvalidResponseDataError,
  );
});
it.each(['outputFormat', 'jsonTool'] as const)(
  'evaluates Boolean alongside Choice and Score using %s',
  async structuredOutputMode => {
    const values = { q0: 'c1', q1: 1.25, q2: 0.02 };
    const { model, fetch } = setup({
      ...fixture,
      stop_reason:
        structuredOutputMode === 'jsonTool' ? 'tool_use' : 'end_turn',
      content:
        structuredOutputMode === 'jsonTool'
          ? [{ type: 'tool_use', id: 'tool-test', name: 'json', input: values }]
          : [{ type: 'text', text: JSON.stringify(values) }],
    });
    const result = await model.doEvaluate({
      ...options,
      questions: {
        ...options.questions,
        flag: { type: 'boolean', instructions: 'Is a refund requested?' },
      },
      providerOptions: { anthropic: { structuredOutputMode } },
    });
    expect(result.answers).toEqual({
      department: { type: 'choice', choice: 'billing' },
      severity: { type: 'score', score: 1.25 },
      flag: { type: 'boolean', probability: 0.02 },
    });
    expect(fetch).toHaveBeenCalledTimes(1);
    const body = JSON.parse(fetch.mock.calls[0][1].body);
    const schema =
      structuredOutputMode === 'jsonTool'
        ? body.tools[0].input_schema
        : body.output_config.format.schema;
    expect(schema).toMatchObject({
      properties: { q2: { type: 'number' } },
      required: ['q0', 'q1', 'q2'],
    });
    expect(schema.properties.q2).not.toHaveProperty('minimum');
    expect(schema.properties.q2).not.toHaveProperty('maximum');
  },
);
