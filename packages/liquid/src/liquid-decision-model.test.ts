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
import { DecisionLiquidModel } from './liquid-decision-model';
import { createLiquid } from './liquid-provider';

const fixture = JSON.parse(
  readFileSync('src/__fixtures__/decisions.json', 'utf8'),
);
const boxNotFoundFixture = JSON.parse(
  readFileSync('src/__fixtures__/decisions-box-not-found.json', 'utf8'),
);

const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const wav = new Uint8Array([
  0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x41, 0x56, 0x45,
]);

const options = {
  state: [
    { type: 'text', text: 'Help! My payouts have been failing for 3 days.' },
  ],
  questions: {
    department: {
      type: 'choice',
      instructions: 'Which team should handle this?',
      criteria: {
        billing: 'Payments, invoicing, refunds',
        technical: 'Bugs, outages, integrations',
        sales: 'Pricing, upgrades, new accounts',
      },
    },
    is_urgent: {
      type: 'boolean',
      instructions: 'Does this convey urgency?',
      criteria: null,
    },
    frustration: {
      type: 'score',
      instructions: 'How frustrated is the customer?',
      criteria: ['Calm', 'Frustrated', 'Very angry'],
    },
  },
} as const satisfies DecisionModelV4CallOptions;

const textAnswers = {
  department: fixture.answers.department,
  is_urgent: fixture.answers.is_urgent,
  frustration: fixture.answers.frustration,
};

const boxOptions = {
  state: [
    { type: 'text', text: 'A support screenshot.' },
    { type: 'file', mediaType: 'image/png', data: { type: 'data', data: png } },
  ],
  questions: {
    subject: { type: 'box', instructions: 'The animal in the picture.' },
  },
} as const satisfies DecisionModelV4CallOptions;

function setup(
  body: unknown = { ...fixture, answers: textAnswers },
  status = 200,
) {
  const fetch = vi.fn<typeof globalThis.fetch>().mockImplementation(
    async () =>
      new Response(JSON.stringify(body), {
        status,
        headers: { 'content-type': 'application/json', 'x-trace': 'trace-1' },
      }),
  );
  const provider = createLiquid({
    apiKey: 'test-key',
    baseURL: 'https://example.com/',
    headers: { 'x-provider': 'custom', shared: 'provider' },
    fetch,
  });
  return { model: provider.decisionModel('d1.2'), fetch };
}

function requestBody(fetch: ReturnType<typeof setup>['fetch']) {
  return JSON.parse(fetch.mock.calls[0][1]?.body as string);
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

it('sends one native request with configured headers', async () => {
  const { model, fetch } = setup();
  await model.doDecide({ ...options, headers: { shared: 'call' } });
  expect(model).toMatchObject({
    specificationVersion: 'v4',
    provider: 'liquid.decision',
    modelId: 'd1.2',
    supportedQuestionTypes: ['choice', 'score', 'boolean', 'box'],
  });
  expect(fetch).toHaveBeenCalledTimes(1);
  const [url, request] = fetch.mock.calls[0];
  expect(url).toBe('https://example.com/decisions/v1/systemone');
  const headers = new Headers(request?.headers);
  expect(Object.fromEntries(headers)).toMatchObject({
    authorization: 'Bearer test-key',
    'content-type': 'application/json',
    'x-provider': 'custom',
    shared: 'call',
  });
  expect(headers.get('user-agent')).toContain('ai-sdk-liquid/');
  expect(requestBody(fetch)).toEqual({
    model: 'd1.2',
    state: 'Help! My payouts have been failing for 3 days.',
    questions: {
      department: options.questions.department,
      is_urgent: {
        type: 'noul',
        instructions: options.questions.is_urgent.instructions,
      },
      frustration: options.questions.frustration,
    },
  });
});

it('maps answers and preserves confidence, legends, usage, cost and response metadata', async () => {
  const body = { ...fixture, answers: textAnswers };
  const result = await setup(body).model.doDecide(options);
  expect(result.answers).toEqual({
    department: {
      type: 'choice',
      choice: 'billing',
      probabilities: fixture.answers.department.probabilities,
    },
    is_urgent: { type: 'boolean', probability: fixture.answers.is_urgent.noul },
    frustration: {
      type: 'score',
      score: fixture.answers.frustration.score,
      probabilities: fixture.answers.frustration.probabilities,
    },
  });
  expect(result.rounding).toBeUndefined();
  expect(result.usage).toEqual({ inputTokens: 612, outputTokens: 0 });
  expect(result.warnings).toEqual([]);
  expect(result.providerMetadata).toEqual({
    liquid: {
      cost: fixture.usage.cost,
      confidence: {
        department: fixture.answers.department.confidence,
        frustration: fixture.answers.frustration.confidence,
      },
      legend: { frustration: fixture.answers.frustration.legend },
      found: {},
    },
  });
  expect(result.response).toMatchObject({
    modelId: 'd1.2',
    headers: { 'x-trace': 'trace-1' },
    body,
  });
});

it('sends a Box question with its image and maps the box', async () => {
  const { model, fetch } = setup({
    model: 'd1.2',
    answers: { subject: fixture.answers.subject },
  });
  const result = await model.doDecide(boxOptions);
  expect(requestBody(fetch)).toEqual({
    model: 'd1.2',
    state: 'A support screenshot.',
    images: ['data:image/png;base64,iVBORw0KGgo='],
    questions: {
      subject: { type: 'box', instructions: 'The animal in the picture.' },
    },
  });
  expect(result.answers).toEqual({
    subject: { type: 'box', box: fixture.answers.subject.box },
  });
  expect(result.providerMetadata?.liquid).toMatchObject({
    confidence: { subject: fixture.answers.subject.confidence },
    found: { subject: 1 },
  });
});

it('returns a refusal when the Box object is not found', async () => {
  const result = await setup(boxNotFoundFixture).model.doDecide({
    state: boxOptions.state,
    questions: { car: { type: 'box', instructions: 'The red sports car.' } },
  });
  expect(result.answers).toEqual({ car: { type: 'refusal' } });
  expect(result.providerMetadata?.liquid.found).toEqual({
    car: boxNotFoundFixture.answers.car.found,
  });
});

it('sends images and audio as ordered top-level data URLs and joins the remaining state', async () => {
  const { model, fetch } = setup({
    answers: { is_urgent: fixture.answers.is_urgent },
  });
  await model.doDecide({
    state: [
      { type: 'text', text: 'The voice note belongs to this ticket.' },
      { type: 'file', mediaType: 'audio', data: { type: 'data', data: wav } },
      { type: 'file', mediaType: 'image', data: { type: 'data', data: png } },
      {
        type: 'file',
        mediaType: 'image/webp',
        data: { type: 'data', data: 'UklGRg==' },
      },
      { type: 'json', value: { plan: 'enterprise' } },
    ],
    questions: { is_urgent: options.questions.is_urgent },
  });
  expect(requestBody(fetch)).toMatchObject({
    state: 'The voice note belongs to this ticket.\n{"plan":"enterprise"}',
    images: [
      'data:image/png;base64,iVBORw0KGgo=',
      'data:image/webp;base64,UklGRg==',
    ],
    audio: ['data:audio/wav;base64,UklGRgAAAABXQVZF'],
  });
});

it.each<[string, DecisionModelV4State, unknown]>([
  [
    'a single JSON object as structured state',
    [{ type: 'json', value: { message: 'Refund me' } }],
    { message: 'Refund me' },
  ],
  [
    'media-only state as null',
    [
      {
        type: 'file',
        mediaType: 'audio/mpeg',
        data: { type: 'data', data: 'SUQz' },
      },
    ],
    null,
  ],
])('sends %s', async (_, state, expected) => {
  const { model, fetch } = setup({
    answers: { is_urgent: fixture.answers.is_urgent },
  });
  await model.doDecide({
    state,
    questions: { is_urgent: options.questions.is_urgent },
  });
  expect(requestBody(fetch).state).toEqual(expected);
});

it.each<[string, DecisionModelV4State, new (...args: never[]) => Error]>([
  [
    'more than eight images',
    Array.from({ length: 9 }, () => ({
      type: 'file' as const,
      mediaType: 'image/png',
      data: { type: 'data' as const, data: png },
    })),
    InvalidArgumentError,
  ],
  [
    'more than eight audio clips',
    Array.from({ length: 9 }, () => ({
      type: 'file' as const,
      mediaType: 'audio/wav',
      data: { type: 'data' as const, data: wav },
    })),
    InvalidArgumentError,
  ],
  [
    'unsupported image types',
    [
      {
        type: 'file',
        mediaType: 'image/gif',
        data: { type: 'data', data: 'R0lGOD==' },
      },
    ],
    UnsupportedFunctionalityError,
  ],
  [
    'undetectable media types',
    [
      {
        type: 'file',
        mediaType: 'audio',
        data: { type: 'data', data: new Uint8Array([1, 2, 3]) },
      },
    ],
    UnsupportedFunctionalityError,
  ],
  [
    'non-image, non-audio media',
    [
      {
        type: 'file',
        mediaType: 'video/mp4',
        data: { type: 'data', data: 'AAAA' },
      },
    ],
    UnsupportedFunctionalityError,
  ],
  [
    'URL file data',
    [
      {
        type: 'file',
        mediaType: 'image/png',
        data: { type: 'url', url: new URL('https://example.com/a.png') },
      },
    ],
    UnsupportedFunctionalityError,
  ],
  [
    'provider references',
    [
      {
        type: 'file',
        mediaType: 'image/png',
        data: { type: 'reference', reference: { liquid: 'file-1' } },
      },
    ],
    UnsupportedFunctionalityError,
  ],
])('rejects %s before HTTP', async (_, state, error) => {
  const { model, fetch } = setup();
  await expect(model.doDecide({ ...options, state })).rejects.toBeInstanceOf(
    error,
  );
  expect(fetch).not.toHaveBeenCalled();
});

describe('request limits', () => {
  it.each<
    [string, DecisionModelV4CallOptions['questions'], DecisionModelV4State?]
  >([
    ['no questions', {}],
    [
      'more than 128 questions',
      Object.fromEntries(
        Array.from({ length: 129 }, (_, i) => [
          String(i),
          options.questions.is_urgent,
        ]),
      ),
    ],
    [
      'missing instructions',
      {
        is_urgent: {
          type: 'boolean',
          criteria: { true: 'Urgent', false: 'Not urgent' },
        },
      },
    ],
    [
      'a single Choice option',
      {
        department: {
          ...options.questions.department,
          criteria: { billing: null },
        },
      },
    ],
    [
      'more than 255 Choice options',
      {
        department: {
          ...options.questions.department,
          criteria: Object.fromEntries(
            Array.from({ length: 256 }, (_, i) => [String(i), null]),
          ),
        },
      },
    ],
    [
      'a single Score level',
      { frustration: { ...options.questions.frustration, criteria: ['Calm'] } },
    ],
    [
      'more than 10 Score levels',
      {
        frustration: {
          ...options.questions.frustration,
          criteria: Array.from({ length: 11 }, (_, i) => String(i)),
        },
      },
    ],
    [
      'null Score levels',
      {
        frustration: {
          ...options.questions.frustration,
          criteria: ['Calm', null],
        },
      },
    ],
    ['a Box question without an image', boxOptions.questions, options.state],
    [
      'a Box question with two images',
      boxOptions.questions,
      [...boxOptions.state, boxOptions.state[1]],
    ],
  ])(
    'rejects %s before HTTP',
    async (_, questions, state = boxOptions.state) => {
      const { model, fetch } = setup();
      await expect(model.doDecide({ state, questions })).rejects.toBeInstanceOf(
        InvalidArgumentError,
      );
      expect(fetch).not.toHaveBeenCalled();
    },
  );

  it('sends Boolean criteria and null Choice descriptions', async () => {
    const { model, fetch } = setup({
      answers: {
        department: {
          ...fixture.answers.department,
          probabilities: { billing: 0.4, technical: 0.6 },
        },
        is_urgent: fixture.answers.is_urgent,
      },
    });
    await model.doDecide({
      ...options,
      questions: {
        department: {
          type: 'choice',
          instructions: 'Which team?',
          criteria: { billing: null, technical: null },
        },
        is_urgent: {
          type: 'boolean',
          instructions: 'Urgent?',
          criteria: { true: 'Needs action today', false: 'Can wait' },
        },
      },
    });
    expect(requestBody(fetch).questions).toEqual({
      department: {
        type: 'choice',
        instructions: 'Which team?',
        criteria: { billing: null, technical: null },
      },
      is_urgent: {
        type: 'noul',
        instructions: 'Urgent?',
        criteria: { true: 'Needs action today', false: 'Can wait' },
      },
    });
  });
});

it('warns about unsupported settings without adding fields to the request', async () => {
  const { model, fetch } = setup();
  const result = await model.doDecide({
    ...options,
    maxOutputTokens: 10,
    reasoning: 'low',
    providerOptions: { liquid: { temperature: 0 } },
  });
  expect(result.warnings).toEqual([
    { type: 'unsupported', feature: 'maxOutputTokens' },
    { type: 'unsupported', feature: 'reasoning' },
    { type: 'unsupported', feature: 'providerOptions.liquid.temperature' },
  ]);
  expect(Object.keys(requestBody(fetch))).toEqual([
    'model',
    'state',
    'questions',
  ]);
});

it.each([
  {},
  { ...textAnswers, extra: textAnswers.is_urgent },
  { department: textAnswers.department, frustration: textAnswers.frustration },
])('rejects missing and unexpected answers', async answers => {
  await expect(
    setup({ answers }).model.doDecide(options),
  ).rejects.toBeInstanceOf(InvalidResponseDataError);
});

it.each([
  { ...textAnswers, is_urgent: { type: 'noul', noul: 1.01 } },
  { ...textAnswers, department: { type: 'choice', choice: 'technical' } },
  { ...textAnswers, is_urgent: { type: 'text', text: 'yes' } },
])('rejects malformed native responses', async answers => {
  await expect(
    setup({ answers }).model.doDecide(options),
  ).rejects.toBeInstanceOf(APICallError);
});

it('preserves Liquid error messages and codes', async () => {
  const result = Promise.resolve(
    setup(
      {
        error: {
          message: 'Invalid API key provided.',
          type: 'authentication_error',
          param: null,
          code: 'invalid_api_key',
        },
      },
      401,
    ).model.doDecide(options),
  );
  await expect(result).rejects.toBeInstanceOf(APICallError);
  await expect(result).rejects.toMatchObject({
    message: 'Invalid API key provided. (invalid_api_key)',
    statusCode: 401,
  });
});

it('restores the endpoint and authentication across workflow serialization', async () => {
  const { model, fetch } = setup();
  const serialized = DecisionLiquidModel[WORKFLOW_SERIALIZE](
    model as DecisionLiquidModel,
  );
  expect(serialized.config.fetch).toBeUndefined();
  vi.stubGlobal('fetch', fetch);
  const restored = DecisionLiquidModel[WORKFLOW_DESERIALIZE]({
    modelId: serialized.modelId,
    config: serialized.config as unknown as Parameters<
      (typeof DecisionLiquidModel)[typeof WORKFLOW_DESERIALIZE]
    >[0]['config'],
  });
  await restored.doDecide(options);
  expect(fetch.mock.calls[0][0]).toBe(
    'https://example.com/decisions/v1/systemone',
  );
  expect(
    new Headers(fetch.mock.calls[0][1]?.headers).get('authorization'),
  ).toBe('Bearer test-key');
});
