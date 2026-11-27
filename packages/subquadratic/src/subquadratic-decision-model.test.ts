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
import { DecisionSubquadraticModel } from './subquadratic-decision-model';
import { createSubquadratic } from './subquadratic-provider';

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
      text: 'I was charged twice for my subscription this month and nobody has answered my emails for a week. Fix this now.',
    },
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

function setup(body: unknown = fixture, status = 200) {
  const fetch = vi.fn<typeof globalThis.fetch>().mockImplementation(
    async () =>
      new Response(JSON.stringify(body), {
        status,
        headers: { 'content-type': 'application/json', 'x-trace': 'trace-1' },
      }),
  );
  const provider = createSubquadratic({
    apiKey: 'test-key',
    baseURL: 'https://example.com/v1/',
    headers: { 'x-provider': 'custom', shared: 'provider' },
    fetch,
  });
  return { model: provider.decisionModel('subq-snap-1.2'), fetch };
}

function requestBody(fetch: ReturnType<typeof setup>['fetch']) {
  return JSON.parse(fetch.mock.calls[0][1]?.body as string);
}

afterEach(() => {
  vi.unstubAllGlobals();
});

it('sends one native request with configured headers', async () => {
  const { model, fetch } = setup();
  await model.doDecide({ ...options, headers: { shared: 'call' } });
  expect(model).toMatchObject({
    specificationVersion: 'v4',
    provider: 'subquadratic.decision',
    modelId: 'subq-snap-1.2',
    supportedQuestionTypes: ['choice', 'score', 'boolean'],
  });
  expect(fetch).toHaveBeenCalledTimes(1);
  const [url, request] = fetch.mock.calls[0];
  expect(url).toBe('https://example.com/v1/systemone');
  expect(Object.fromEntries(new Headers(request?.headers))).toMatchObject({
    authorization: 'Bearer test-key',
    'content-type': 'application/json',
    'x-provider': 'custom',
    shared: 'call',
  });
  expect(requestBody(fetch)).toEqual({
    model: 'subq-snap-1.2',
    state: options.state[0].text,
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

it('maps answers and preserves confidence, legends, usage and response metadata', async () => {
  const result = await setup().model.doDecide(options);
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
  expect(result.usage).toEqual({ inputTokens: 177, outputTokens: 0 });
  expect(result.warnings).toEqual([]);
  expect(result.providerMetadata).toEqual({
    subquadratic: {
      confidence: {
        department: fixture.answers.department.confidence,
        frustration: fixture.answers.frustration.confidence,
      },
      legend: { frustration: fixture.answers.frustration.legend },
    },
  });
  expect(result.response).toMatchObject({
    modelId: 'subq-snap-1.2',
    headers: { 'x-trace': 'trace-1' },
    body: fixture,
  });
});

it('sends images as top-level plain base64 and joins the remaining state', async () => {
  const { model, fetch } = setup(imageFixture);
  const result = await model.doDecide({
    state: [
      { type: 'text', text: 'Classify the animal.' },
      { type: 'file', mediaType: 'image', data: { type: 'data', data: png } },
      {
        type: 'file',
        mediaType: 'image/webp',
        data: { type: 'data', data: 'UklGRg==' },
      },
      { type: 'json', value: { source: 'upload' } },
    ],
    questions: {
      animal: {
        type: 'choice',
        instructions: 'Which animal is shown?',
        criteria: { cat: null, dog: null, bird: null },
      },
    },
  });
  expect(requestBody(fetch)).toMatchObject({
    state: 'Classify the animal.\n{"source":"upload"}',
    images: [
      { mediaType: 'image/png', base64: 'iVBORw0KGgo=' },
      { mediaType: 'image/webp', base64: 'UklGRg==' },
    ],
  });
  expect(result.usage).toEqual({ inputTokens: 345, outputTokens: 0 });
});

it.each<[string, DecisionModelV4State, unknown]>([
  [
    'a single JSON object as structured state',
    [{ type: 'json', value: { message: 'Refund me' } }],
    { message: 'Refund me' },
  ],
  [
    'image-only state as null',
    [
      {
        type: 'file',
        mediaType: 'image/png',
        data: { type: 'data', data: png },
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

it.each<[string, DecisionModelV4State]>([
  [
    'unsupported image types',
    [
      {
        type: 'file',
        mediaType: 'image/gif',
        data: { type: 'data', data: 'R0lGOD==' },
      },
    ],
  ],
  [
    'undetectable media types',
    [
      {
        type: 'file',
        mediaType: 'image',
        data: { type: 'data', data: new Uint8Array([1, 2, 3]) },
      },
    ],
  ],
  [
    'non-image media',
    [
      {
        type: 'file',
        mediaType: 'audio/wav',
        data: { type: 'data', data: 'UklGRg==' },
      },
    ],
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
  ],
])('rejects %s before HTTP', async (_, state) => {
  const { model, fetch } = setup();
  await expect(model.doDecide({ ...options, state })).rejects.toBeInstanceOf(
    UnsupportedFunctionalityError,
  );
  expect(fetch).not.toHaveBeenCalled();
});

it('rejects Box questions before HTTP', async () => {
  const { model, fetch } = setup();
  await expect(
    model.doDecide({
      state: options.state,
      questions: { subject: { type: 'box', instructions: 'The animal.' } },
    }),
  ).rejects.toBeInstanceOf(UnsupportedFunctionalityError);
  expect(fetch).not.toHaveBeenCalled();
});

describe('request limits', () => {
  it.each<[string, DecisionModelV4CallOptions['questions']]>([
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
      { is_urgent: { type: 'boolean', criteria: { true: 'Urgent' } } },
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
  ])('rejects %s before HTTP', async (_, questions) => {
    const { model, fetch } = setup();
    await expect(
      model.doDecide({ state: options.state, questions }),
    ).rejects.toBeInstanceOf(InvalidArgumentError);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('sends Boolean criteria, null Choice descriptions and null Score levels', async () => {
    const { model, fetch } = setup({
      answers: {
        department: fixture.answers.department,
        is_urgent: fixture.answers.is_urgent,
        frustration: fixture.answers.frustration,
      },
    });
    await model.doDecide({
      state: options.state,
      questions: {
        department: {
          type: 'choice',
          instructions: 'Which team?',
          criteria: { billing: null, technical: null },
        },
        is_urgent: {
          type: 'boolean',
          instructions: 'Urgent?',
          criteria: { true: 'Needs action today' },
        },
        frustration: {
          type: 'score',
          instructions: 'How frustrated?',
          criteria: ['Calm', null, 'Very angry'],
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
        criteria: { true: 'Needs action today' },
      },
      frustration: {
        type: 'score',
        instructions: 'How frustrated?',
        criteria: ['Calm', null, 'Very angry'],
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
    providerOptions: { subquadratic: { temperature: 0 } },
  });
  expect(result.warnings).toEqual([
    { type: 'unsupported', feature: 'maxOutputTokens' },
    { type: 'unsupported', feature: 'reasoning' },
    {
      type: 'unsupported',
      feature: 'providerOptions.subquadratic.temperature',
    },
  ]);
  expect(Object.keys(requestBody(fetch))).toEqual([
    'model',
    'state',
    'questions',
  ]);
});

it.each([
  {},
  { ...fixture.answers, extra: fixture.answers.is_urgent },
  {
    department: fixture.answers.department,
    frustration: fixture.answers.frustration,
  },
])('rejects missing and unexpected answers', async answers => {
  await expect(
    setup({ ...fixture, answers }).model.doDecide(options),
  ).rejects.toBeInstanceOf(InvalidResponseDataError);
});

it.each([
  { ...fixture.answers, is_urgent: { type: 'noul', noul: 1.01 } },
  { ...fixture.answers, department: { type: 'choice', choice: 'technical' } },
  { ...fixture.answers, is_urgent: { type: 'text', text: 'yes' } },
])('rejects malformed native responses', async answers => {
  await expect(
    setup({ ...fixture, answers }).model.doDecide(options),
  ).rejects.toBeInstanceOf(APICallError);
});

it('preserves SubQ error messages and types', async () => {
  const result = Promise.resolve(
    setup(
      {
        detail: {
          error_type: 'validation_error',
          message: "Unknown model 'subq-snap-x'.",
        },
      },
      422,
    ).model.doDecide(options),
  );
  await expect(result).rejects.toBeInstanceOf(APICallError);
  await expect(result).rejects.toMatchObject({
    message: "Unknown model 'subq-snap-x'. (validation_error)",
    statusCode: 422,
  });
});

it('restores the endpoint and authentication across workflow serialization', async () => {
  const { model, fetch } = setup();
  const serialized = DecisionSubquadraticModel[WORKFLOW_SERIALIZE](
    model as DecisionSubquadraticModel,
  );
  expect(serialized.config.fetch).toBeUndefined();
  vi.stubGlobal('fetch', fetch);
  const restored = DecisionSubquadraticModel[WORKFLOW_DESERIALIZE]({
    modelId: serialized.modelId,
    config: serialized.config as unknown as Parameters<
      (typeof DecisionSubquadraticModel)[typeof WORKFLOW_DESERIALIZE]
    >[0]['config'],
  });
  await restored.doDecide(options);
  expect(fetch.mock.calls[0][0]).toBe('https://example.com/v1/systemone');
  expect(
    new Headers(fetch.mock.calls[0][1]?.headers).get('authorization'),
  ).toBe('Bearer test-key');
});
