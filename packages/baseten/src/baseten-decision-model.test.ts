import {
  APICallError,
  Experimental_DecisionUnsupportedQuestionTypeError as DecisionUnsupportedQuestionTypeError,
  InvalidArgumentError,
  InvalidResponseDataError,
  UnsupportedFunctionalityError,
  type Experimental_DecisionModelV4CallOptions as DecisionModelV4CallOptions,
} from '@ai-sdk/provider';
import {
  WORKFLOW_DESERIALIZE,
  WORKFLOW_SERIALIZE,
} from '@ai-sdk/provider-utils';
import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DecisionBasetenModel } from './baseten-decision-model';
import { createBaseten } from './baseten-provider';

// Captured from mammoth-1 on 2026-10-22 using src/decide/baseten/basic.ts.
const fixture = JSON.parse(
  readFileSync('src/__fixtures__/decisions.json', 'utf8'),
);
const modelId = 'decision-models/baseten-mammoth-27b-latest';
const options = {
  state: [
    {
      type: 'text',
      text: 'I was charged twice. Please refund the duplicate charge.',
    },
  ],
  questions: {
    route: {
      type: 'choice',
      instructions: 'Which team should handle this request?',
      criteria: {
        billing: 'Payments, charges, and refunds',
        support: 'Technical troubleshooting',
      },
    },
    refund: {
      type: 'boolean',
      instructions: 'Is the customer asking for a refund?',
    },
    urgency: {
      type: 'score',
      instructions: 'How urgent is the request?',
      criteria: [
        'Routine request',
        'Needs attention today',
        'Immediate emergency',
      ],
    },
  },
} as const satisfies DecisionModelV4CallOptions;

function setup(body: unknown = fixture, status = 200) {
  const fetch = vi.fn<typeof globalThis.fetch>().mockImplementation(
    async () =>
      new Response(typeof body === 'string' ? body : JSON.stringify(body), {
        status,
        statusText: 'Bad Request',
        headers: {
          'content-type': 'application/json',
          'x-baseten-request-id': 'request-123',
          'retry-after': '2',
        },
      }),
  );
  const provider = createBaseten({
    apiKey: 'test-key',
    baseURL: 'https://example.com/v1/',
    headers: { 'x-provider': 'custom', shared: 'provider' },
    fetch,
  });
  return { provider, model: provider.decisionModel(modelId), fetch };
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

it('sends a native System One request with all question types and configured headers', async () => {
  const { model, fetch } = setup();
  await model.doDecide({ ...options, headers: { shared: 'call' } });
  expect(model.specificationVersion).toBe('v4');
  expect(model.provider).toBe('baseten.decision');
  expect(model.supportedQuestionTypes).toEqual(['choice', 'score', 'boolean']);
  expect(fetch).toHaveBeenCalledTimes(1);
  const [url, request] = fetch.mock.calls[0];
  expect(url).toBe('https://example.com/v1/systemone');
  expect(Object.fromEntries(new Headers(request?.headers))).toMatchObject({
    authorization: 'Bearer test-key',
    'content-type': 'application/json',
    'x-provider': 'custom',
    shared: 'call',
  });
  expect(new Headers(request?.headers).get('user-agent')).toContain(
    'ai-sdk-baseten/',
  );
  expect(JSON.parse(request?.body as string)).toEqual({
    model: modelId,
    state: options.state[0].text,
    questions: {
      ...options.questions,
      refund: { ...options.questions.refund, type: 'noul' },
    },
  });
});

it('preserves full-precision answers, confidence, legends, usage and response metadata', async () => {
  const result = await setup().model.doDecide(options);
  expect(result.answers).toEqual({
    route: {
      type: 'choice',
      choice: fixture.answers.route.choice,
      probabilities: fixture.answers.route.probabilities,
    },
    refund: { type: 'boolean', probability: fixture.answers.refund.noul },
    urgency: {
      type: 'score',
      score: fixture.answers.urgency.score,
      probabilities: fixture.answers.urgency.probabilities,
    },
  });
  expect(result.rounding).toBeUndefined();
  expect(result.usage).toEqual({ inputTokens: 227, outputTokens: 3 });
  expect(result.providerMetadata).toEqual({
    baseten: {
      confidence: {
        route: fixture.answers.route.confidence,
        urgency: fixture.answers.urgency.confidence,
      },
      legend: { urgency: fixture.answers.urgency.legend },
    },
  });
  expect(result.response).toMatchObject({
    id: 'request-123',
    modelId,
    body: fixture,
    headers: { 'x-baseten-request-id': 'request-123' },
  });
});

it.each([
  'decision-models/baseten-elephant-9b-latest',
  modelId,
  'future-model',
])('passes the model ID %s through without aliases', async id => {
  const { provider, fetch } = setup({ ...fixture, model: 'backend-model' });
  const result = await provider.decisionModel(id).doDecide(options);
  expect(JSON.parse(fetch.mock.calls[0][1]?.body as string).model).toBe(id);
  expect(result.response?.modelId).toBe('backend-model');
});

it('loads the API key lazily and uses the default endpoint', async () => {
  const { fetch } = setup();
  const model = createBaseten({ fetch }).decisionModel(modelId);
  vi.stubEnv('BASETEN_API_KEY', 'environment-key');
  await model.doDecide(options);
  expect(fetch.mock.calls[0][0]).toBe(
    'https://inference.baseten.co/v1/systemone',
  );
  expect(
    new Headers(fetch.mock.calls[0][1]?.headers).get('authorization'),
  ).toBe('Bearer environment-key');
});

it('preserves structured and criteria-only questions, filling missing Boolean descriptions with defaults', async () => {
  const { model, fetch } = setup();
  const questions = {
    route: {
      type: 'choice',
      instructions: null,
      criteria: { billing: { team: 'Finance' }, support: null },
    },
    refund: { type: 'boolean', criteria: { true: ['Asks for money back'] } },
    urgency: {
      type: 'score',
      criteria: [null, { impact: 'High' }, ['Emergency']],
    },
  } as const;
  await model.doDecide({ ...options, questions });
  expect(JSON.parse(fetch.mock.calls[0][1]?.body as string).questions).toEqual({
    ...questions,
    refund: {
      type: 'noul',
      criteria: { true: ['Asks for money back'], false: null },
    },
  });
});

it.each([
  {
    state: [
      {
        type: 'json',
        value: { messages: [{ role: 'user', content: 'Hello' }] },
      },
    ],
    expected: { messages: [{ role: 'user', content: 'Hello' }] },
  },
  {
    state: [{ type: 'json', value: ['first', 'second'] }],
    expected: ['first', 'second'],
  },
  { state: [{ type: 'json', value: null }], expected: [null] },
  { state: [{ type: 'json', value: 0 }], expected: [0] },
  {
    state: [
      { type: 'text', text: 'First' },
      { type: 'json', value: { second: true } },
    ],
    expected: ['First', { second: true }],
  },
] satisfies {
  state: DecisionModelV4CallOptions['state'];
  expected: unknown;
}[])(
  'preserves state order and native JSON without serializing it: $expected',
  async ({ state, expected }) => {
    const { model, fetch } = setup();
    await model.doDecide({ ...options, state });
    expect(JSON.parse(fetch.mock.calls[0][1]?.body as string).state).toEqual(
      expected,
    );
  },
);

describe('image state', () => {
  it.each(['image/png', 'image/jpeg', 'image/webp'])(
    'sends %s images within a user message',
    async mediaType => {
      const { model, fetch } = setup();
      await model.doDecide({
        ...options,
        state: [
          { type: 'text', text: 'Inspect' },
          {
            type: 'file',
            mediaType,
            data: { type: 'data', data: new Uint8Array([1, 2, 3]) },
          },
          { type: 'json', value: { description: 'Product' } },
          { type: 'file', mediaType, data: { type: 'data', data: 'BAUG' } },
        ],
      });
      expect(JSON.parse(fetch.mock.calls[0][1]?.body as string).state).toEqual({
        messages: [
          {
            role: 'user',
            content: [
              { type: 'text', text: 'Inspect' },
              {
                type: 'image_url',
                image_url: { url: `data:${mediaType};base64,AQID` },
              },
              { type: 'text', text: '{"description":"Product"}' },
              {
                type: 'image_url',
                image_url: { url: `data:${mediaType};base64,BAUG` },
              },
            ],
          },
        ],
      });
    },
  );

  it.each(['audio/wav', 'video/mp4', 'application/pdf'])(
    'rejects unsupported %s input before HTTP',
    async mediaType => {
      const { model, fetch } = setup();
      await expect(
        model.doDecide({
          ...options,
          state: [
            { type: 'file', mediaType, data: { type: 'data', data: 'AQID' } },
          ],
        }),
      ).rejects.toBeInstanceOf(UnsupportedFunctionalityError);
      expect(fetch).not.toHaveBeenCalled();
    },
  );

  it('rejects more than four images before HTTP', async () => {
    const { model, fetch } = setup();
    await expect(
      model.doDecide({
        ...options,
        state: Array.from({ length: 5 }, () => ({
          type: 'file' as const,
          mediaType: 'image/png',
          data: { type: 'data' as const, data: 'AQID' },
        })),
      }),
    ).rejects.toBeInstanceOf(InvalidArgumentError);
    expect(fetch).not.toHaveBeenCalled();
  });
});

it('sends maxLen as an input token limit and warns about unsupported generation options', async () => {
  const { model, fetch } = setup();
  const result = await model.doDecide({
    ...options,
    maxOutputTokens: 10,
    reasoning: 'high',
    providerOptions: {
      baseten: { maxLen: 1024, temperature: 0 },
    },
  });
  expect(JSON.parse(fetch.mock.calls[0][1]?.body as string)).toEqual({
    model: modelId,
    state: options.state[0].text,
    questions: {
      ...options.questions,
      refund: { ...options.questions.refund, type: 'noul' },
    },
    max_len: 1024,
  });
  expect(result.warnings).toEqual([
    { type: 'unsupported', feature: 'maxOutputTokens' },
    { type: 'unsupported', feature: 'reasoning' },
    { type: 'unsupported', feature: 'providerOptions.baseten.temperature' },
  ]);
});

it.each([0, -1, 1.5])('rejects invalid maxLen %s before HTTP', async maxLen => {
  const { model, fetch } = setup();
  await expect(
    model.doDecide({ ...options, providerOptions: { baseten: { maxLen } } }),
  ).rejects.toThrow();
  expect(fetch).not.toHaveBeenCalled();
});

describe('question limits', () => {
  it.each<DecisionModelV4CallOptions['questions']>([
    {},
    { route: { ...options.questions.route, criteria: {} } },
    {
      route: {
        ...options.questions.route,
        criteria: Object.fromEntries(
          Array.from({ length: 256 }, (_, i) => [String(i), null]),
        ),
      },
    },
    { urgency: { type: 'score', criteria: [] } },
    {
      urgency: {
        type: 'score',
        criteria: Array.from({ length: 11 }, () => 'Level'),
      },
    },
    Object.fromEntries(
      Array.from({ length: 257 }, (_, i) => [
        String(i),
        options.questions.refund,
      ]),
    ),
  ])(
    'rejects invalid question counts or options before HTTP',
    async questions => {
      const { model, fetch } = setup();
      await expect(
        model.doDecide({ ...options, questions }),
      ).rejects.toBeInstanceOf(InvalidArgumentError);
      expect(fetch).not.toHaveBeenCalled();
    },
  );

  it('accepts exactly 512 options without splitting the request', async () => {
    const questions = Object.fromEntries(
      Array.from({ length: 256 }, (_, i) => [
        String(i),
        options.questions.refund,
      ]),
    );
    const answers = Object.fromEntries(
      Object.keys(questions).map(id => [id, fixture.answers.refund]),
    );
    const { model, fetch } = setup({ answers });
    await model.doDecide({ ...options, questions });
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('rejects box questions on direct provider calls', async () => {
    const { model, fetch } = setup();
    await expect(
      model.doDecide({
        ...options,
        questions: { box: { type: 'box', instructions: 'Locate the product' } },
      }),
    ).rejects.toBeInstanceOf(DecisionUnsupportedQuestionTypeError);
    expect(fetch).not.toHaveBeenCalled();
  });
});

it.each([
  {},
  { ...fixture.answers, extra: fixture.answers.refund },
  { ...fixture.answers, refund: undefined },
])('rejects missing or unexpected answers', async answers => {
  await expect(
    setup({ answers }).model.doDecide(options),
  ).rejects.toBeInstanceOf(InvalidResponseDataError);
});

it.each([
  { ...fixture.answers, refund: { type: 'noul', noul: 1.01 } },
  { ...fixture.answers, route: { type: 'choice', choice: 'billing' } },
  {
    ...fixture.answers,
    urgency: { ...fixture.answers.urgency, probabilities: { '0': -1 } },
  },
])('rejects malformed native responses', async answers => {
  await expect(
    setup({ answers }).model.doDecide(options),
  ).rejects.toBeInstanceOf(APICallError);
});

it.each([undefined, null])(
  'tolerates missing or null ancillary fields: %s',
  async value => {
    const body = structuredClone(fixture);
    body.model = value;
    body.usage = value;
    body.answers.route.confidence = value;
    body.answers.urgency.confidence = value;
    body.answers.urgency.legend = value;
    const result = await setup(body).model.doDecide(options);
    expect(result.usage).toBeUndefined();
    expect(result.response?.modelId).toBe(modelId);
    expect(result.providerMetadata).toEqual({
      baseten: { confidence: {}, legend: {} },
    });
  },
);

it.each([
  {
    error: 'Question type must be choice, noul or score',
    error_type: 'Validation',
  },
  { error: { message: 'Question type must be choice, noul or score' } },
])('preserves native error messages', async body => {
  await expect(setup(body, 400).model.doDecide(options)).rejects.toMatchObject({
    message: 'Question type must be choice, noul or score',
    statusCode: 400,
    isRetryable: false,
  });
});

it.each([413, 422, 429, 500, 503])(
  'preserves HTTP %s and retry headers for non-JSON errors',
  async status => {
    await expect(
      setup('', status).model.doDecide(options),
    ).rejects.toMatchObject({
      statusCode: status,
      isRetryable: status === 429 || status >= 500,
      responseHeaders: { 'retry-after': '2' },
    });
  },
);

it('forwards cancellation without retrying inside the provider', async () => {
  const controller = new AbortController();
  const fetch = vi
    .fn<typeof globalThis.fetch>()
    .mockImplementation(async (_url, init) => {
      expect(init?.signal).toBe(controller.signal);
      throw new DOMException('Cancelled', 'AbortError');
    });
  await expect(
    createBaseten({ apiKey: 'test', fetch })
      .decisionModel(modelId)
      .doDecide({ ...options, abortSignal: controller.signal }),
  ).rejects.toThrow('Cancelled');
  expect(fetch).toHaveBeenCalledTimes(1);
});

it('restores the model, endpoint and authentication across workflow serialization', async () => {
  const { model, fetch } = setup();
  const serialized = DecisionBasetenModel[WORKFLOW_SERIALIZE](
    model as DecisionBasetenModel,
  );
  expect(serialized.config.fetch).toBeUndefined();
  vi.stubGlobal('fetch', fetch);
  const restored = DecisionBasetenModel[WORKFLOW_DESERIALIZE]({
    modelId: serialized.modelId,
    config: serialized.config as unknown as Parameters<
      (typeof DecisionBasetenModel)[typeof WORKFLOW_DESERIALIZE]
    >[0]['config'],
  });
  await restored.doDecide(options);
  expect(fetch.mock.calls[0][0]).toBe('https://example.com/v1/systemone');
  expect(
    new Headers(fetch.mock.calls[0][1]?.headers).get('authorization'),
  ).toBe('Bearer test-key');
});
