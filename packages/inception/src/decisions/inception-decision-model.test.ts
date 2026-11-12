import {
  InvalidArgumentError,
  InvalidResponseDataError,
  UnsupportedFunctionalityError,
  Experimental_DecisionUnsupportedQuestionTypeError as DecisionUnsupportedQuestionTypeError,
  type Experimental_DecisionModelV4CallOptions as DecisionModelV4CallOptions,
} from '@ai-sdk/provider';
import {
  WORKFLOW_DESERIALIZE,
  WORKFLOW_SERIALIZE,
} from '@ai-sdk/provider-utils';
import { afterEach, expect, it, vi } from 'vitest';
import { createInception, inception } from '../inception-provider';
import { DecisionInceptionModel } from './inception-decision-model';

// Illustrative response from Inception's OpenAPI 1.0.0, not a live capture.
const response = {
  model: 'mercury-decide',
  answers: {
    billing: { type: 'noul', noul: 0.97 },
    team: {
      type: 'choice',
      choice: 'billing',
      probabilities: { billing: 0.96, support: 0.04 },
      confidence: 0.96,
    },
    urgency: {
      type: 'score',
      score: 1.1,
      probabilities: { '0': 0.1, '1': 0.7, '2': 0.2 },
      confidence: 0.7,
      legend: { '0': 'Can wait', '1': 'Soon', '2': 'Immediately' },
    },
  },
  usage: { input_tokens: 120, output_tokens: 3 },
};
const options = {
  state: [
    { type: 'json', value: { message: 'Please refund a duplicate charge.' } },
  ],
  questions: {
    billing: { type: 'boolean', instructions: 'Is this about billing?' },
    team: {
      type: 'choice',
      criteria: { billing: 'Payments and refunds', support: 'Other requests' },
    },
    urgency: { type: 'score', criteria: ['Can wait', 'Soon', 'Immediately'] },
  },
} as const satisfies DecisionModelV4CallOptions;

function setup(body: unknown = response, status = 200) {
  const fetch = vi.fn<typeof globalThis.fetch>(async () =>
    Response.json(body, { status, headers: { 'x-request-id': 'request-123' } }),
  );
  const model = createInception({
    apiKey: 'test-key',
    baseURL: 'https://example.com/v1/',
    headers: { 'x-provider': 'custom' },
    fetch,
  }).decisionModel('mercury-decide');
  return { model, fetch };
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

it('sends all questions in one native request and preserves answers and metadata', async () => {
  const { model, fetch } = setup();
  const abortSignal = new AbortController().signal;
  const result = await model.doDecide({
    ...options,
    abortSignal,
    headers: { 'x-request': 'custom' },
  });
  expect(model.provider).toBe('inception.decision');
  expect(model.specificationVersion).toBe('v4');
  expect(model.supportedQuestionTypes).toEqual(['boolean', 'choice', 'score']);
  expect(fetch).toHaveBeenCalledTimes(1);
  const [url, request] = fetch.mock.calls[0];
  expect(url).toBe('https://example.com/v1/decisions');
  expect(request?.signal).toBe(abortSignal);
  expect(Object.fromEntries(new Headers(request?.headers))).toMatchObject({
    authorization: 'Bearer test-key',
    'x-provider': 'custom',
    'x-request': 'custom',
    'user-agent': expect.stringContaining('ai-sdk-inception/'),
  });
  expect(JSON.parse(request?.body as string)).toEqual({
    model: 'mercury-decide',
    state: options.state[0].value,
    questions: {
      ...options.questions,
      billing: { ...options.questions.billing, type: 'noul' },
    },
  });
  expect(result.answers).toEqual({
    billing: { type: 'boolean', probability: 0.97 },
    team: {
      type: 'choice',
      choice: 'billing',
      probabilities: response.answers.team.probabilities,
    },
    urgency: {
      type: 'score',
      score: 1.1,
      probabilities: response.answers.urgency.probabilities,
    },
  });
  expect(result.usage).toEqual({ inputTokens: 120, outputTokens: 3 });
  expect(result.providerMetadata).toEqual({
    inception: {
      confidence: { team: 0.96, urgency: 0.7 },
      legend: { urgency: response.answers.urgency.legend },
    },
  });
  expect(result.response).toMatchObject({
    id: 'request-123',
    modelId: 'mercury-decide',
    body: response,
  });
  expect(result.warnings).toEqual([]);
  expect(result.rounding).toBeUndefined();
});

it('preserves structured instructions and criteria and encodes image state', async () => {
  const { model, fetch } = setup();
  const questions = {
    billing: {
      type: 'boolean',
      criteria: { true: { topic: 'Billing' }, false: null },
    },
    team: {
      type: 'choice',
      instructions: ['Route the ticket'],
      criteria: { billing: null, support: { topic: 'Other' } },
    },
    urgency: {
      type: 'score',
      instructions: null,
      criteria: [{ impact: 'Low' }, { impact: 'Medium' }, { impact: 'High' }],
    },
  } as const;
  await model.doDecide({
    state: [
      { type: 'text', text: 'Inspect the screenshot' },
      { type: 'json', value: { account: 'Enterprise' } },
      {
        type: 'file',
        mediaType: 'image',
        data: { type: 'data', data: new Uint8Array([71, 73, 70, 56, 57, 97]) },
      },
      {
        type: 'file',
        mediaType: 'image/png',
        data: { type: 'data', data: 'aW1hZ2U=' },
      },
    ],
    questions,
  });
  expect(JSON.parse(fetch.mock.calls[0][1]?.body as string)).toMatchObject({
    state: [
      'Inspect the screenshot',
      { account: 'Enterprise' },
      {
        type: 'image_url',
        image_url: { url: 'data:image/gif;base64,R0lGODlh' },
      },
      {
        type: 'image_url',
        image_url: { url: 'data:image/png;base64,aW1hZ2U=' },
      },
    ],
    questions: {
      ...questions,
      billing: { ...questions.billing, type: 'noul' },
    },
  });
});

it('accepts a single choice and score level and preserves zero values', async () => {
  const { model, fetch } = setup({
    answers: {
      team: {
        type: 'choice',
        choice: 'billing',
        probabilities: { billing: 1 },
        confidence: 1,
      },
      urgency: {
        type: 'score',
        score: 0,
        probabilities: { '0': 1 },
        confidence: 1,
        legend: { '0': 'Only level' },
      },
    },
  });
  const result = await model.doDecide({
    state: [{ type: 'text', text: 'A ticket' }],
    questions: {
      team: { type: 'choice', criteria: { billing: null } },
      urgency: { type: 'score', criteria: ['Only level'] },
    },
  });
  expect(JSON.parse(fetch.mock.calls[0][1]?.body as string).state).toBe(
    'A ticket',
  );
  expect(result.answers.urgency).toEqual({
    type: 'score',
    score: 0,
    probabilities: { '0': 1 },
  });
  expect(result.response?.modelId).toBe('mercury-decide');
  expect(result.usage).toBeUndefined();
});

it('omits unsupported settings with warnings', async () => {
  const { model, fetch } = setup();
  const result = await model.doDecide({
    ...options,
    maxOutputTokens: 100,
    reasoning: 'high',
    providerOptions: { inception: { realtime: true } },
  });
  expect(result.warnings).toEqual([
    { type: 'unsupported', feature: 'maxOutputTokens' },
    { type: 'unsupported', feature: 'reasoning' },
    { type: 'unsupported', feature: 'providerOptions.inception.realtime' },
  ]);
  expect(
    Object.keys(JSON.parse(fetch.mock.calls[0][1]?.body as string)),
  ).toEqual(['model', 'state', 'questions']);
});

it.each<DecisionModelV4CallOptions['questions']>([
  {},
  { invalid: { type: 'choice', criteria: {} } },
  {
    invalid: {
      type: 'choice',
      criteria: Object.fromEntries(
        Array.from({ length: 256 }, (_, i) => [String(i), null]),
      ),
    },
  },
  { invalid: { type: 'score', criteria: [] } },
  { invalid: { type: 'score', criteria: ['Low', null] } },
  {
    invalid: {
      type: 'score',
      criteria: Array.from({ length: 11 }, () => 'Level'),
    },
  },
])('rejects invalid criteria before fetching: %j', async questions => {
  const { model, fetch } = setup();
  await expect(
    model.doDecide({ ...options, questions }),
  ).rejects.toBeInstanceOf(InvalidArgumentError);
  expect(fetch).not.toHaveBeenCalled();
});

it('rejects box questions and unsupported file inputs before fetching', async () => {
  const { model, fetch } = setup();
  await expect(
    model.doDecide({
      ...options,
      questions: { box: { type: 'box', instructions: 'Find a cat' } },
    }),
  ).rejects.toBeInstanceOf(DecisionUnsupportedQuestionTypeError);
  await expect(
    model.doDecide({
      ...options,
      state: [
        {
          type: 'file',
          mediaType: 'application/pdf',
          data: { type: 'data', data: 'aW1hZ2U=' },
        },
      ],
    }),
  ).rejects.toBeInstanceOf(UnsupportedFunctionalityError);
  expect(fetch).not.toHaveBeenCalled();
});

it.each([
  { answers: {} },
  { answers: { ...response.answers, extra: { type: 'noul', noul: 0.5 } } },
  { answers: { ...response.answers, billing: { type: 'noul', noul: 2 } } },
])('rejects missing, extra or malformed answers: %j', async body => {
  await expect(setup(body).model.doDecide(options)).rejects.toThrow();
});

it('rejects a substituted answer even when the answer count matches', async () => {
  const { billing, ...answers } = response.answers;
  await expect(
    setup({ answers: { ...answers, other: billing } }).model.doDecide(options),
  ).rejects.toBeInstanceOf(InvalidResponseDataError);
});

it.each([
  [
    { error: { message: 'Invalid API key', type: 'authentication_error' } },
    401,
    'Invalid API key',
  ],
  [
    {
      detail: [
        { loc: ['body', 'questions'], msg: 'Field required', type: 'missing' },
      ],
    },
    422,
    'Field required',
  ],
] as const)('parses API errors: %j', async (body, status, message) => {
  const { model } = setup(body, status);
  await expect(model.doDecide(options)).rejects.toMatchObject({
    name: 'AI_APICallError',
    message,
    statusCode: status,
  });
});

it('uses the default endpoint and resolves credentials for every request', async () => {
  let key = 'first-key';
  const fetch = vi.fn<typeof globalThis.fetch>(async () =>
    Response.json(response),
  );
  const model = createInception({ apiKey: () => key, fetch }).decisionModel(
    'mercury-decide',
  );
  await model.doDecide(options);
  key = 'second-key';
  await model.doDecide(options);
  expect(
    fetch.mock.calls.map(([url, request]) => [
      url,
      new Headers(request?.headers).get('authorization'),
    ]),
  ).toEqual([
    ['https://api.inceptionlabs.ai/v1/decisions', 'Bearer first-key'],
    ['https://api.inceptionlabs.ai/v1/decisions', 'Bearer second-key'],
  ]);
  expect(inception.decisionModel('mercury-decide').provider).toBe(
    'inception.decision',
  );
});

it('restores the endpoint and environment authentication after serialization', async () => {
  const { model, fetch } = setup();
  const serialized = DecisionInceptionModel[WORKFLOW_SERIALIZE](
    model as DecisionInceptionModel,
  );
  expect(serialized.config).toMatchObject({
    provider: 'inception.decision',
    baseURL: 'https://example.com/v1',
    headers: { authorization: 'Bearer test-key', 'x-provider': 'custom' },
  });
  vi.stubEnv('INCEPTION_API_KEY', 'workflow-key');
  vi.stubGlobal('fetch', fetch);
  const restored = DecisionInceptionModel[WORKFLOW_DESERIALIZE]({
    ...serialized,
    config: {
      ...serialized.config,
      provider: model.provider,
      baseURL: serialized.config.baseURL as string,
      headers: undefined,
    },
  });
  await restored.doDecide(options);
  expect(fetch.mock.calls[0]).toMatchObject([
    'https://example.com/v1/decisions',
    {
      headers: expect.objectContaining({
        authorization: 'Bearer workflow-key',
      }),
    },
  ]);
});
