import { APICallError, InvalidResponseDataError } from '@ai-sdk/provider';
import {
  WORKFLOW_DESERIALIZE,
  WORKFLOW_SERIALIZE,
} from '@ai-sdk/provider-utils';
import { afterEach, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { createOpenAI } from './openai-provider';
import { OpenAIDecisionModel } from './openai-decision-model';

// Illustrative Decisions API response, not a live capture.
const fixture = JSON.parse(
  readFileSync('src/__fixtures__/decision.json', 'utf8'),
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
    refund: { type: 'boolean', instructions: 'Is a refund requested?' },
  },
} as const;

function setup(body: unknown = fixture, status = 200) {
  const fetch = vi.fn<typeof globalThis.fetch>().mockImplementation(
    async () =>
      new Response(JSON.stringify(body), {
        status,
        headers: {
          'content-type': 'application/json',
          'x-request-id': 'req-test',
        },
      }),
  );
  const provider = createOpenAI({
    apiKey: 'test-key',
    baseURL: 'https://example.com/v1/',
    organization: 'org-test',
    project: 'proj-test',
    headers: { 'x-provider': 'configured', shared: 'provider' },
    fetch,
  });
  return { model: provider.decisionModel('gpt-6-luna'), fetch };
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

it('sends all primitives directly to Decisions with configured authentication and headers', async () => {
  const { model, fetch } = setup();
  await model.doDecide({ ...options, headers: { shared: 'call' } });
  expect(model.provider).toBe('openai.decision');
  expect(model.specificationVersion).toBe('v4');
  expect(model.supportedQuestionTypes).toEqual(['choice', 'score', 'boolean']);
  expect(fetch).toHaveBeenCalledTimes(1);
  const [url, request] = fetch.mock.calls[0];
  expect(url).toBe('https://example.com/v1/decisions');
  expect(Object.fromEntries(new Headers(request?.headers))).toMatchObject({
    authorization: 'Bearer test-key',
    'openai-organization': 'org-test',
    'openai-project': 'proj-test',
    'x-provider': 'configured',
    shared: 'call',
  });
  expect(new Headers(request?.headers).get('user-agent')).toContain(
    'ai-sdk-openai/',
  );
  expect(JSON.parse(request?.body as string)).toEqual({
    model: 'gpt-6-luna',
    input: options.state,
    questions: [
      {
        type: 'choice',
        name: 'department',
        instructions: 'Pick the team.',
        choices: [
          { value: 'technical', description: 'Bugs' },
          { value: 'billing', description: 'Charges' },
        ],
      },
      {
        type: 'score',
        name: 'severity',
        instructions: 'Rate severity.',
        levels: [
          { label: '0', description: 'Low' },
          { label: '1', description: 'Medium' },
          { label: '2', description: 'High' },
        ],
      },
      {
        type: 'predicate',
        name: 'refund',
        instructions: 'Is a refund requested?',
      },
    ],
  });
});

it('preserves native values, maps reordered named answers, and exposes confidence and response metadata', async () => {
  const { model } = setup({ answers: [...fixture.answers].reverse() });
  const result = await model.doDecide(options);
  expect(result.answers).toEqual({
    department: {
      type: 'choice',
      choice: 'billing',
      probabilities: { technical: 0.08, billing: 0.92 },
    },
    severity: {
      type: 'score',
      score: 0.98,
      probabilities: { 0: 0.08, 1: 0.86, 2: 0.06 },
    },
    refund: { type: 'boolean', probability: 0.96 },
  });
  expect(result.providerMetadata).toEqual({
    openai: { confidence: { department: 0.88, severity: 0.79 } },
  });
  expect(result.rounding).toEqual({ probabilityDecimals: 2 });
  expect(result.usage).toBeUndefined();
  expect(result.response?.body).toEqual({
    answers: [...fixture.answers].reverse(),
  });
  expect(result.response?.modelId).toBe('gpt-6-luna');
  expect(result.response?.headers?.['x-request-id']).toBe('req-test');
});

it('serializes structured input and rubrics, omits null descriptions, and preserves boolean criteria', async () => {
  const { model, fetch } = setup();
  await model.doDecide({
    state: { ticket: ['charged twice'] },
    questions: {
      department: {
        type: 'choice',
        instructions: { task: 'route' },
        criteria: { technical: null, billing: { rubric: ['charges'] } },
      },
      severity: {
        type: 'score',
        instructions: ['severity'],
        criteria: [null, { meaning: 'high' }],
      },
      refund: {
        type: 'boolean',
        instructions: 'Refund?',
        criteria: {
          true: { meaning: 'Explicit request for money back' },
          false: 'The customer only asks about refund status.',
        },
      },
    },
  });
  expect(JSON.parse(fetch.mock.calls[0][1]?.body as string)).toEqual({
    model: 'gpt-6-luna',
    input: '{"ticket":["charged twice"]}',
    questions: [
      {
        name: 'department',
        type: 'choice',
        instructions: '{"task":"route"}',
        choices: [
          { value: 'technical' },
          { value: 'billing', description: '{"rubric":["charges"]}' },
        ],
      },
      {
        name: 'severity',
        type: 'score',
        instructions: '["severity"]',
        levels: [
          { label: '0' },
          { label: '1', description: '{"meaning":"high"}' },
        ],
      },
      {
        name: 'refund',
        type: 'predicate',
        instructions:
          'Refund?\n\nCriteria for true:\n{"meaning":"Explicit request for money back"}\n\nCriteria for false:\nThe customer only asks about refund status.',
      },
    ],
  });
});

it('warns about unsupported Responses options without sending them', async () => {
  const { model, fetch } = setup();
  const result = await model.doDecide({
    ...options,
    providerOptions: { openai: { reasoningEffort: 'high' } },
  });
  expect(result.warnings).toEqual([
    { type: 'unsupported', feature: 'providerOptions.openai.reasoningEffort' },
  ]);
  expect(JSON.parse(fetch.mock.calls[0][1]?.body as string)).not.toHaveProperty(
    'reasoning',
  );
});

it.each(
  [
    [],
    [...fixture.answers, fixture.answers[0]],
    [fixture.answers[0], fixture.answers[0], fixture.answers[2]],
    [
      fixture.answers[0],
      fixture.answers[1],
      { type: 'predicate', name: 'unknown', probability: 0.5 },
    ],
  ].map(answers => ({ answers })),
)(
  'rejects missing, duplicate, and unexpected answer names',
  async ({ answers }) => {
    await expect(
      setup({ answers }).model.doDecide(options),
    ).rejects.toBeInstanceOf(InvalidResponseDataError);
  },
);

it('rejects duplicate distribution values before converting arrays to maps', async () => {
  const body = structuredClone(fixture);
  body.answers[0].probabilities.push(body.answers[0].probabilities[0]);
  await expect(setup(body).model.doDecide(options)).rejects.toBeInstanceOf(
    InvalidResponseDataError,
  );
});

it.each([
  { answers: [{ type: 'predicate', name: 'refund', probability: 1.1 }] },
  { answers: [{ type: 'choice', name: 'department', choice: 'billing' }] },
  {
    answers: [
      {
        type: 'score',
        name: 'severity',
        score: 1,
        probabilities: [{ value: 0.5, probability: 1 }],
      },
    ],
  },
  { answers: null },
])('rejects malformed successful responses', async body => {
  await expect(setup(body).model.doDecide(options)).rejects.toBeInstanceOf(
    APICallError,
  );
});

it('uses the standard OpenAI API error handler', async () => {
  await expect(
    setup(
      {
        error: {
          message: 'Decisions access not enabled',
          type: 'invalid_request_error',
        },
      },
      403,
    ).model.doDecide(options),
  ).rejects.toMatchObject({
    message: 'Decisions access not enabled',
    statusCode: 403,
  });
});

it('forwards cancellation to custom fetch', async () => {
  const controller = new AbortController();
  const fetch = vi
    .fn<typeof globalThis.fetch>()
    .mockImplementation(async (_url, init) => {
      expect(init?.signal).toBe(controller.signal);
      throw new DOMException('Cancelled', 'AbortError');
    });
  await expect(
    createOpenAI({ apiKey: 'test', fetch })
      .decisionModel('gpt-6-luna')
      .doDecide({ ...options, abortSignal: controller.signal }),
  ).rejects.toThrow('Cancelled');
  expect(fetch).toHaveBeenCalledTimes(1);
});

it('uses lazy environment authentication and configured provider name', async () => {
  const { fetch } = setup();
  const model = createOpenAI({ name: 'custom', fetch }).decisionModel(
    'future-decisions-model',
  );
  vi.stubEnv('OPENAI_API_KEY', 'environment-key');
  await model.doDecide(options);
  expect(model.provider).toBe('custom.decision');
  expect(fetch.mock.calls[0][0]).toBe('https://api.openai.com/v1/decisions');
  expect(
    new Headers(fetch.mock.calls[0][1]?.headers).get('authorization'),
  ).toBe('Bearer environment-key');
  expect(JSON.parse(fetch.mock.calls[0][1]?.body as string).model).toBe(
    'future-decisions-model',
  );
});

it('restores the Decisions endpoint and headers across workflow serialization', async () => {
  const { model, fetch } = setup();
  const serialized = OpenAIDecisionModel[WORKFLOW_SERIALIZE](
    model as OpenAIDecisionModel,
  );
  expect(serialized.config.fetch).toBeUndefined();
  expect(serialized.config.url).toBeUndefined();
  vi.stubGlobal('fetch', fetch);
  const restored = OpenAIDecisionModel[WORKFLOW_DESERIALIZE](serialized);
  await restored.doDecide(options);
  expect(fetch.mock.calls[0][0]).toBe('https://example.com/v1/decisions');
  expect(
    new Headers(fetch.mock.calls[0][1]?.headers).get('authorization'),
  ).toBe('Bearer test-key');
});

const liveFixture = JSON.parse(
  readFileSync('src/__fixtures__/decision-live.json', 'utf8'),
);

it('maps a captured live Decisions response including usage, confidence, and resolved model', async () => {
  const body = { ...liveFixture, model: 'gpt-6-luna-resolved' };
  const result = await setup(body).model.doDecide({
    ...options,
    questions: {
      department: options.questions.department,
      severity: options.questions.severity,
      requestsRefund: options.questions.refund,
    },
  });
  expect(result.usage).toEqual({ inputTokens: 387, outputTokens: 3 });
  expect(result.providerMetadata).toEqual({
    openai: {
      confidence: { department: 1, severity: 1 },
      usage: liveFixture.usage,
    },
  });
  expect(result.response?.modelId).toBe('gpt-6-luna-resolved');
  expect(result.response?.body).toEqual(body);
  expect(result.answers).toEqual({
    department: {
      type: 'choice',
      choice: 'billing',
      probabilities: { billing: 1, technical: 0, other: 0 },
    },
    severity: { type: 'score', score: 1, probabilities: { 0: 0, 1: 1, 2: 0 } },
    requestsRefund: { type: 'boolean', probability: 0.99 },
  });
});

it('preserves nonzero native cache and reasoning counts without changing aggregate usage', async () => {
  const usage = {
    input_tokens: 387,
    output_tokens: 3,
    total_tokens: 390,
    input_tokens_details: { cached_tokens: 50, cache_write_tokens: 20 },
    output_tokens_details: { reasoning_tokens: 2 },
  };
  const result = await setup({ ...fixture, usage }).model.doDecide(options);
  expect(result.usage).toEqual({ inputTokens: 387, outputTokens: 3 });
  expect(result.providerMetadata?.openai?.usage).toEqual(usage);
});

it.each([undefined, null])(
  'accepts absent or null usage and model without inventing counts',
  async value => {
    const result = await setup({
      ...fixture,
      usage: value,
      model: value,
    }).model.doDecide(options);
    expect(result.usage).toBeUndefined();
    expect(result.providerMetadata?.openai).not.toHaveProperty('usage');
    expect(result.response?.modelId).toBe('gpt-6-luna');
  },
);

it('accepts partial usage and preserves zero token counts', async () => {
  const usage = {
    input_tokens: 0,
    output_tokens: null,
    input_tokens_details: null,
    output_tokens_details: null,
    total_tokens: null,
  };
  const result = await setup({ ...fixture, usage }).model.doDecide(options);
  expect(result.usage).toEqual({ inputTokens: 0, outputTokens: undefined });
  expect(result.providerMetadata?.openai?.usage).toEqual(usage);
});

it.each([
  { criteria: undefined, expected: 'Refund?' },
  { criteria: {}, expected: 'Refund?' },
  { criteria: { true: null, false: null }, expected: 'Refund?' },
  {
    criteria: { true: 'Money back', false: null },
    expected: 'Refund?\n\nCriteria for true:\nMoney back',
  },
  {
    criteria: { false: ['Status request'] },
    expected: 'Refund?\n\nCriteria for false:\n["Status request"]',
  },
] as const)(
  'formats only supplied non-null boolean criteria',
  async ({ criteria, expected }) => {
    const { model, fetch } = setup();
    await model.doDecide({
      ...options,
      questions: {
        ...options.questions,
        refund: { type: 'boolean', instructions: 'Refund?', criteria },
      },
    });
    const body = JSON.parse(fetch.mock.calls[0][1]?.body as string);
    expect(body.questions[2].instructions).toBe(expected);
  },
);

it('keeps the deprecated evaluation factory and method backed by Decisions', async () => {
  const { fetch } = setup();
  const provider = createOpenAI({ apiKey: 'test-key', fetch });
  expect(provider.evaluationModel).toBe(provider.decisionModel);
  const model = provider.evaluationModel('gpt-6-luna');
  const result = await model.doEvaluate(options);
  expect(result.answers.refund).toEqual({ type: 'boolean', probability: 0.96 });
  expect(model.provider).toBe('openai.decision');
  expect(fetch.mock.calls[0][0]).toBe('https://api.openai.com/v1/decisions');
});
