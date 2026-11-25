import {
  APICallError,
  InvalidArgumentError,
  InvalidResponseDataError,
  UnsupportedFunctionalityError,
  type Experimental_DecisionModelV4CallOptions as DecisionModelV4CallOptions,
  type Experimental_DecisionModelV4State as DecisionModelV4State,
} from '@ai-sdk/provider';
import {
  WORKFLOW_DESERIALIZE,
  WORKFLOW_SERIALIZE,
} from '@ai-sdk/provider-utils';
import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DecisionBasetenModel } from './baseten-decision-model';
import { createBaseten } from './baseten-provider';

const fixture = JSON.parse(
  readFileSync('src/__fixtures__/decisions.json', 'utf8'),
);
const imageFixture = JSON.parse(
  readFileSync('src/__fixtures__/decisions-image.json', 'utf8'),
);

const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

const options = {
  state: [
    {
      type: 'text',
      text: 'I was charged twice for my subscription. Please refund the duplicate charge today.',
    },
  ],
  questions: {
    team: {
      type: 'choice',
      instructions: 'Which team should handle this?',
      criteria: {
        billing: 'Charges, refunds, payment methods',
        engineering: 'Bugs and outages',
        account: null,
      },
    },
    refund: {
      type: 'boolean',
      instructions: 'Does the customer ask for a refund?',
    },
    refund_criteria: {
      type: 'boolean',
      instructions: 'Is this a refund request?',
      criteria: {
        true: 'The customer wants money back',
        false: 'Anything else',
      },
    },
    urgency: {
      type: 'score',
      instructions: 'How urgent is this?',
      criteria: [
        'Can wait',
        'Handle today',
        'Time-sensitive',
        'Blocking revenue',
      ],
    },
  },
} as const satisfies DecisionModelV4CallOptions;

const imageQuestions = {
  red: { type: 'boolean', instructions: 'Is this image predominantly red?' },
} as const satisfies DecisionModelV4CallOptions['questions'];

function setup(body: unknown = fixture, status = 200) {
  const fetch = vi.fn<typeof globalThis.fetch>().mockImplementation(
    async () =>
      new Response(JSON.stringify(body), {
        status,
        headers: { 'content-type': 'application/json', 'x-trace': 'trace-1' },
      }),
  );
  const provider = createBaseten({
    apiKey: 'test-key',
    baseURL: 'https://example.com/v1/',
    headers: { 'x-provider': 'custom', shared: 'provider' },
    fetch,
  });
  return {
    model: provider.decisionModel('decision-models/baseten-bison-latest'),
    fetch,
  };
}

function requestBody(fetch: ReturnType<typeof setup>['fetch']) {
  return JSON.parse(fetch.mock.calls[0][1]?.body as string);
}

afterEach(() => {
  vi.unstubAllGlobals();
});

it('sends one System One JSON request with configured headers', async () => {
  const { model, fetch } = setup();
  await model.doDecide({ ...options, headers: { shared: 'call' } });
  expect(model).toMatchObject({
    specificationVersion: 'v4',
    provider: 'baseten.decision',
    modelId: 'decision-models/baseten-bison-latest',
    supportedQuestionTypes: ['choice', 'score', 'boolean'],
  });
  expect(fetch).toHaveBeenCalledTimes(1);
  const [url, request] = fetch.mock.calls[0];
  expect(url).toBe('https://example.com/v1/systemone');
  const headers = new Headers(request?.headers);
  expect(Object.fromEntries(headers)).toMatchObject({
    authorization: 'Bearer test-key',
    'content-type': 'application/json',
    'x-provider': 'custom',
    shared: 'call',
  });
  expect(headers.get('user-agent')).toContain('ai-sdk-baseten/');
  expect(requestBody(fetch)).toEqual({
    model: 'decision-models/baseten-bison-latest',
    state: options.state[0].text,
    questions: {
      team: options.questions.team,
      refund: {
        type: 'noul',
        instructions: options.questions.refund.instructions,
      },
      refund_criteria: {
        ...options.questions.refund_criteria,
        type: 'noul',
      },
      urgency: options.questions.urgency,
    },
  });
});

it('maps answers, usage, confidence, legends, and response metadata', async () => {
  const result = await setup().model.doDecide(options);
  expect(result.answers).toEqual({
    team: {
      type: 'choice',
      choice: 'billing',
      probabilities: fixture.answers.team.probabilities,
    },
    refund: { type: 'boolean', probability: fixture.answers.refund.noul },
    refund_criteria: {
      type: 'boolean',
      probability: fixture.answers.refund_criteria.noul,
    },
    urgency: {
      type: 'score',
      score: fixture.answers.urgency.score,
      probabilities: fixture.answers.urgency.probabilities,
    },
  });
  expect(result.rounding).toBeUndefined();
  expect(result.usage).toEqual({ inputTokens: 295, outputTokens: 4 });
  expect(result.warnings).toEqual([]);
  expect(result.providerMetadata).toEqual({
    baseten: {
      confidence: {
        team: fixture.answers.team.confidence,
        urgency: fixture.answers.urgency.confidence,
      },
      legend: { urgency: fixture.answers.urgency.legend },
    },
  });
  expect(result.response).toMatchObject({
    modelId: 'decision-models/baseten-bison-31b-latest',
    headers: { 'x-trace': 'trace-1' },
    body: fixture,
  });
});

it('returns undefined usage when the response has none', async () => {
  const { usage: _, ...body } = fixture;
  const result = await setup(body).model.doDecide(options);
  expect(result.usage).toBeUndefined();
});

describe('state', () => {
  it.each<[string, DecisionModelV4State, unknown]>([
    [
      'a single JSON object as structured state',
      [{ type: 'json', value: { plan: 'business', message: 'Refund me.' } }],
      { plan: 'business', message: 'Refund me.' },
    ],
    [
      'a conversation JSON object as is',
      [
        {
          type: 'json',
          value: { messages: [{ role: 'user', content: 'Refund me.' }] },
        },
      ],
      { messages: [{ role: 'user', content: 'Refund me.' }] },
    ],
    [
      'text and JSON parts joined as text',
      [
        { type: 'text', text: 'Ticket:' },
        { type: 'json', value: { message: 'The API is down.' } },
      ],
      'Ticket:\n{"message":"The API is down."}',
    ],
  ])('sends %s', async (_, state, expected) => {
    const { model, fetch } = setup();
    await model.doDecide({ ...options, state });
    expect(requestBody(fetch).state).toEqual(expected);
  });

  it('sends images as JSON in one user message, in request order', async () => {
    const { model, fetch } = setup({
      ...imageFixture,
      answers: { red: imageFixture.answers.red },
    });
    await model.doDecide({
      state: [
        { type: 'text', text: 'First screenshot:' },
        {
          type: 'file',
          mediaType: 'image/png',
          data: { type: 'data', data: png },
        },
        { type: 'json', value: { page: 'checkout' } },
        {
          type: 'file',
          mediaType: 'image/*',
          data: { type: 'data', data: 'iVBORw0KGgo=' },
        },
        {
          type: 'file',
          mediaType: 'image/jpeg',
          data: {
            type: 'url',
            url: new URL('https://storage.googleapis.com/bucket/photo.jpg'),
          },
        },
      ],
      questions: imageQuestions,
    });
    expect(
      new Headers(fetch.mock.calls[0][1]?.headers).get('content-type'),
    ).toBe('application/json');
    expect(requestBody(fetch).state).toEqual({
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: 'First screenshot:' },
            {
              type: 'image_url',
              image_url: { url: 'data:image/png;base64,iVBORw0KGgo=' },
            },
            { type: 'text', text: '{"page":"checkout"}' },
            {
              type: 'image_url',
              image_url: { url: 'data:image/png;base64,iVBORw0KGgo=' },
            },
            {
              type: 'image_url',
              image_url: {
                url: 'https://storage.googleapis.com/bucket/photo.jpg',
              },
            },
          ],
        },
      ],
    });
  });

  it('reports image requests usage, including image tokens', async () => {
    const result = await setup(imageFixture).model.doDecide({
      state: [
        { type: 'text', text: 'Look at the image.' },
        {
          type: 'file',
          mediaType: 'image/png',
          data: { type: 'data', data: png },
        },
      ],
      questions: imageQuestions,
    });
    expect(result.answers).toEqual({
      red: { type: 'boolean', probability: imageFixture.answers.red.noul },
    });
    expect(result.usage).toEqual({ inputTokens: 729, outputTokens: 1 });
  });

  it.each<[string, DecisionModelV4State[number]]>([
    [
      'audio files',
      {
        type: 'file',
        mediaType: 'audio/wav',
        data: { type: 'data', data: png },
      },
    ],
    [
      'unsupported image types',
      {
        type: 'file',
        mediaType: 'image/gif',
        data: { type: 'data', data: png },
      },
    ],
    [
      'file references',
      {
        type: 'file',
        mediaType: 'image/png',
        data: { type: 'reference', reference: { baseten: 'file-1' } },
      },
    ],
  ])('rejects %s before HTTP', async (_, part) => {
    const { model, fetch } = setup();
    await expect(
      model.doDecide({ state: [part], questions: imageQuestions }),
    ).rejects.toBeInstanceOf(UnsupportedFunctionalityError);
    expect(fetch).not.toHaveBeenCalled();
  });
});

describe('questions', () => {
  it('fills a missing yes/no outcome and omits absent instructions', async () => {
    const { model, fetch } = setup({
      ...fixture,
      answers: { refund: fixture.answers.refund },
    });
    await model.doDecide({
      ...options,
      questions: {
        refund: { type: 'boolean', criteria: { true: 'Wants money back' } },
      },
    });
    expect(requestBody(fetch).questions).toEqual({
      refund: {
        type: 'noul',
        criteria: { true: 'Wants money back', false: null },
      },
    });
  });

  it('sends null Score levels', async () => {
    const { model, fetch } = setup({
      ...fixture,
      answers: { urgency: fixture.answers.urgency },
    });
    await model.doDecide({
      ...options,
      questions: {
        urgency: { type: 'score', criteria: ['Low', null, 'High'] },
      },
    });
    expect(requestBody(fetch).questions.urgency.criteria).toEqual([
      'Low',
      null,
      'High',
    ]);
  });

  it('rejects Box questions before HTTP', async () => {
    const { model, fetch } = setup();
    await expect(
      model.doDecide({
        ...options,
        questions: { signature: { type: 'box', instructions: 'Signature.' } },
      }),
    ).rejects.toBeInstanceOf(UnsupportedFunctionalityError);
    expect(fetch).not.toHaveBeenCalled();
  });
});

describe('request limits', () => {
  it.each<
    [string, DecisionModelV4CallOptions['questions'], DecisionModelV4State?]
  >([
    ['no questions', {}],
    [
      'no Choice options',
      { team: { ...options.questions.team, criteria: {} } },
    ],
    [
      'more than 255 Choice options',
      {
        team: {
          ...options.questions.team,
          criteria: Object.fromEntries(
            Array.from({ length: 256 }, (_, i) => [String(i), null]),
          ),
        },
      },
    ],
    [
      'no Score levels',
      { urgency: { ...options.questions.urgency, criteria: [] } },
    ],
    [
      'more than 10 Score levels',
      {
        urgency: {
          ...options.questions.urgency,
          criteria: Array.from({ length: 11 }, (_, i) => String(i)),
        },
      },
    ],
    [
      'more than 512 options across questions',
      Object.fromEntries(
        Array.from({ length: 257 }, (_, i) => [
          String(i),
          options.questions.refund,
        ]),
      ),
    ],
    [
      'more than 16 images',
      imageQuestions,
      Array.from({ length: 17 }, () => ({
        type: 'file' as const,
        mediaType: 'image/png',
        data: { type: 'data' as const, data: png },
      })),
    ],
  ])('rejects %s before HTTP', async (_, questions, state = options.state) => {
    const { model, fetch } = setup();
    await expect(model.doDecide({ state, questions })).rejects.toBeInstanceOf(
      InvalidArgumentError,
    );
    expect(fetch).not.toHaveBeenCalled();
  });
});

it('warns about unsupported settings without adding fields to the request', async () => {
  const { model, fetch } = setup();
  const result = await model.doDecide({
    ...options,
    maxOutputTokens: 10,
    reasoning: 'low',
    providerOptions: { baseten: { serviceTier: 'flex' } },
  });
  expect(result.warnings).toEqual([
    { type: 'unsupported', feature: 'maxOutputTokens' },
    { type: 'unsupported', feature: 'reasoning' },
    { type: 'unsupported', feature: 'providerOptions.baseten.serviceTier' },
  ]);
  expect(Object.keys(requestBody(fetch))).toEqual([
    'model',
    'state',
    'questions',
  ]);
});

it.each([
  {},
  { ...fixture.answers, extra: fixture.answers.refund },
  { team: fixture.answers.team, urgency: fixture.answers.urgency },
])('rejects missing and unexpected answers', async answers => {
  await expect(
    setup({ ...fixture, answers }).model.doDecide(options),
  ).rejects.toBeInstanceOf(InvalidResponseDataError);
});

it.each([
  { ...fixture.answers, refund: { type: 'noul', noul: 1.01 } },
  { ...fixture.answers, team: { type: 'choice', choice: 'billing' } },
  { ...fixture.answers, refund: { type: 'box', box: null } },
])('rejects malformed native responses', async answers => {
  await expect(
    setup({ ...fixture, answers }).model.doDecide(options),
  ).rejects.toBeInstanceOf(APICallError);
});

it('preserves Baseten validation error messages', async () => {
  const result = Promise.resolve(
    setup(
      {
        error: 'Question type must be choice, noul or score',
        error_type: 'Validation',
      },
      422,
    ).model.doDecide(options),
  );
  await expect(result).rejects.toBeInstanceOf(APICallError);
  await expect(result).rejects.toMatchObject({
    message: 'Question type must be choice, noul or score',
    statusCode: 422,
  });
});

it('restores the endpoint and authentication across workflow serialization', async () => {
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
