import {
  APICallError,
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
import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ParallelDecisionModel } from './parallel-decision-model';
import { createParallel, parallel } from './parallel-provider';

// Illustrative fixture based on the public contract, not a live capture.
const fixture = JSON.parse(
  readFileSync('src/__fixtures__/decisions.json', 'utf8'),
);
const options = {
  state: [
    {
      type: 'json',
      value: { company: 'Parallel', website: 'https://parallel.ai' },
    },
  ],
  questions: {
    hasSearch: { type: 'boolean', instructions: 'Does it offer web search?' },
    availability: {
      type: 'choice',
      instructions: 'Is the API available?',
      criteria: {
        available: 'Publicly available',
        unknown: 'Insufficient evidence',
      },
    },
    fit: {
      type: 'score',
      instructions: 'How well does it fit?',
      criteria: ['No fit', 'Partial fit', 'Full fit'],
    },
  },
} as const satisfies DecisionModelV4CallOptions;

function setup(body: unknown = fixture, status = 200) {
  const fetch = vi.fn<typeof globalThis.fetch>().mockImplementation(async () =>
    Response.json(body, {
      status,
      headers: { 'retry-after': '2', 'x-request-id': 'request-123' },
    }),
  );
  const provider = createParallel({
    apiKey: 'test-key',
    baseURL: 'https://example.com/v1/',
    headers: { 'x-provider': 'custom' },
    fetch,
  });
  return { fetch, model: provider.decisionModel('fast'), provider };
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

it('sends the native contract with configured auth, options and request headers', async () => {
  const { fetch, model } = setup();
  await model.doDecide({
    ...options,
    headers: { 'x-call': 'custom' },
    providerOptions: { parallel: { includeExcerpts: false } },
  });
  expect(fetch).toHaveBeenCalledTimes(1);
  const [url, request] = fetch.mock.calls[0] ?? [];
  expect(url).toBe('https://example.com/v1/decisions');
  expect(Object.fromEntries(new Headers(request?.headers))).toMatchObject({
    'x-api-key': 'test-key',
    'x-provider': 'custom',
    'x-call': 'custom',
    'content-type': 'application/json',
  });
  expect(new Headers(request?.headers).get('authorization')).toBeNull();
  expect(new Headers(request?.headers).get('user-agent')).toContain(
    'ai-sdk-parallel/',
  );
  expect(JSON.parse(String(request?.body))).toEqual({
    mode: 'fast',
    include_excerpts: false,
    state: options.state[0].value,
    questions: {
      ...options.questions,
      hasSearch: { ...options.questions.hasSearch, type: 'noul' },
    },
  });
});

it('preserves full precision, citations, confidence, legends and usage', async () => {
  const { model } = setup();
  const result = await model.doDecide(options);
  expect(result.answers).toEqual({
    hasSearch: { type: 'boolean', probability: 0.9992643798509062 },
    availability: {
      type: 'choice',
      choice: 'available',
      probabilities: fixture.answers.availability.probabilities,
    },
    fit: {
      type: 'score',
      score: 1.7123456789,
      probabilities: fixture.answers.fit.probabilities,
    },
  });
  expect(result.providerMetadata).toEqual({
    parallel: {
      citations: fixture.citations,
      confidence: { availability: 0.87654321, fit: 0.7654321 },
      legend: { fit: fixture.answers.fit.legend },
      decisionId: fixture.decision_id,
      mode: 'fast',
    },
  });
  expect(result.rounding).toBeUndefined();
  expect(result.usage).toEqual({ inputTokens: 4212, outputTokens: 0 });
  expect(result.response).toMatchObject({
    id: fixture.decision_id,
    modelId: 'fast',
    body: fixture,
  });
});

it('preserves refusal answers alongside successful answers', async () => {
  const result = await setup({
    ...fixture,
    answers: { ...fixture.answers, hasSearch: { type: 'refusal' } },
  }).model.doDecide(options);
  expect(result.answers.hasSearch).toEqual({ type: 'refusal' });
  expect(result.answers.fit).toMatchObject({
    type: 'score',
    score: 1.7123456789,
  });
});

it.each(
  [[], [{ url: 'https://example.com', excerpts: [] }]].map(citations => ({
    citations,
  })),
)('preserves empty evidence fields: %j', async ({ citations }) => {
  const result = await setup({ ...fixture, citations }).model.doDecide(options);
  expect(result.providerMetadata?.parallel?.citations).toEqual(citations);
});

it.each(
  (
    [
      [],
      [{ type: 'text', text: 'A company' }],
      [{ type: 'json', value: null }],
      [{ type: 'json', value: [1, 'two'] }],
      [
        { type: 'text', text: 'A company' },
        { type: 'json', value: { website: 'https://example.com' } },
      ],
    ] satisfies DecisionModelV4CallOptions['state'][]
  ).map(state => ({ state })),
)('preserves JSON and text state: %j', async ({ state }) => {
  const { fetch, model } = setup();
  await model.doDecide({ ...options, state });
  const [, request] = fetch.mock.calls[0] ?? [];
  const values = state.map(part =>
    part.type === 'text' ? part.text : part.type === 'json' ? part.value : null,
  );
  expect(JSON.parse(String(request?.body)).state).toEqual(
    values.length === 1 ? values[0] : values,
  );
});

it('rejects unsupported inputs and invalid options before provider I/O', async () => {
  const { fetch, model } = setup();
  await expect(
    model.doDecide({
      ...options,
      questions: { box: { type: 'box', instructions: 'Find a box' } },
    }),
  ).rejects.toBeInstanceOf(DecisionUnsupportedQuestionTypeError);
  await expect(
    model.doDecide({
      ...options,
      state: [
        {
          type: 'file',
          mediaType: 'image/png',
          data: { type: 'data', data: 'abcd' },
        },
      ],
    }),
  ).rejects.toBeInstanceOf(UnsupportedFunctionalityError);
  await expect(
    model.doDecide({
      ...options,
      providerOptions: { parallel: { includeExcerpts: 'false' } },
    }),
  ).rejects.toBeInstanceOf(InvalidArgumentError);
  expect(fetch).not.toHaveBeenCalled();
});

describe('request limits', () => {
  it.each<DecisionModelV4CallOptions['questions']>([
    {},
    Object.fromEntries(
      Array.from({ length: 101 }, (_, i) => [
        `q${i}`,
        options.questions.hasSearch,
      ]),
    ),
    { 'bad name': options.questions.hasSearch },
    {
      choice: {
        ...options.questions.availability,
        criteria: { only: 'One option' },
      },
    },
    {
      choice: {
        ...options.questions.availability,
        criteria: Object.fromEntries(
          Array.from({ length: 256 }, (_, i) => [`c${i}`, 'Option']),
        ),
      },
    },
    { score: { ...options.questions.fit, criteria: ['One level'] } },
    {
      score: {
        ...options.questions.fit,
        criteria: Array.from({ length: 11 }, () => 'Level'),
      },
    },
  ])('rejects invalid questions before I/O: %j', async questions => {
    const { fetch, model } = setup();
    await expect(
      model.doDecide({ ...options, questions }),
    ).rejects.toBeInstanceOf(InvalidArgumentError);
    expect(fetch).not.toHaveBeenCalled();
  });
});

it.each([
  {
    ...fixture,
    answers: { ...fixture.answers, hasSearch: { type: 'noul', noul: 2 } },
  },
  { ...fixture, answers: { hasSearch: fixture.answers.hasSearch } },
  {
    ...fixture,
    answers: { ...fixture.answers, unexpected: fixture.answers.hasSearch },
  },
  {
    ...fixture,
    citations: [{ url: 'https://example.com', excerpts: 'not-an-array' }],
  },
])('rejects malformed provider responses', async response => {
  await expect(setup(response).model.doDecide(options)).rejects.toSatisfy(
    error =>
      APICallError.isInstance(error) ||
      InvalidResponseDataError.isInstance(error),
  );
});

it.each([400, 401, 422, 429, 500])(
  'preserves provider errors and retry headers (%i)',
  async status => {
    const { model } = setup(
      {
        type: 'error',
        error: { message: 'Request rejected', ref_id: 'error-123' },
      },
      status,
    );
    await expect(model.doDecide(options)).rejects.toMatchObject({
      name: 'AI_APICallError',
      message: 'Request rejected',
      statusCode: status,
      responseHeaders: { 'retry-after': '2' },
    });
  },
);

it('passes abort signals through unchanged', async () => {
  const { fetch, model } = setup();
  const controller = new AbortController();
  await model.doDecide({ ...options, abortSignal: controller.signal });
  expect(fetch.mock.calls[0]?.[1]?.signal).toBe(controller.signal);
});

it('warns about unsupported generation and provider options', async () => {
  const result = await setup().model.doDecide({
    ...options,
    maxOutputTokens: 10,
    reasoning: 'low',
    providerOptions: { parallel: { unused: true } },
  });
  expect(result.warnings).toEqual([
    { type: 'unsupported', feature: 'maxOutputTokens' },
    { type: 'unsupported', feature: 'reasoning' },
    { type: 'unsupported', feature: 'providerOptions.parallel.unused' },
  ]);
});

it('uses environment auth, the default endpoint, and exported provider', async () => {
  vi.stubEnv('PARALLEL_API_KEY', 'environment-key');
  const { fetch } = setup();
  vi.stubGlobal('fetch', fetch);
  await parallel.decisionModel('fast').doDecide(options);
  expect(fetch.mock.calls[0]?.[0]).toBe('https://api.parallel.ai/v1/decisions');
  expect(new Headers(fetch.mock.calls[0]?.[1]?.headers).get('x-api-key')).toBe(
    'environment-key',
  );
});

it('rejects unsupported model families', () => {
  const { provider } = setup();
  expect(() => provider.languageModel('fast')).toThrow('No such languageModel');
  expect(() => provider.embeddingModel('fast')).toThrow(
    'No such embeddingModel',
  );
  expect(() => provider.imageModel('fast')).toThrow('No such imageModel');
  expect(() => provider.decisionModel('')).toThrow('No such decisionModel');
});

it('serializes model configuration and restores the request contract', async () => {
  const model = setup().model as ParallelDecisionModel;
  const serialized = ParallelDecisionModel[WORKFLOW_SERIALIZE](model);
  expect(serialized).toMatchObject({
    modelId: 'fast',
    config: { baseURL: 'https://example.com/v1' },
  });
  const restored = ParallelDecisionModel[WORKFLOW_DESERIALIZE]({
    modelId: serialized.modelId,
    config: serialized.config as unknown as Parameters<
      (typeof ParallelDecisionModel)[typeof WORKFLOW_DESERIALIZE]
    >[0]['config'],
  });
  const { fetch } = setup();
  vi.stubGlobal('fetch', fetch);
  await restored.doDecide(options);
  expect(new Headers(fetch.mock.calls[0]?.[1]?.headers).get('x-api-key')).toBe(
    'test-key',
  );
});

it('forwards future mode strings without a package update', async () => {
  const { fetch } = setup({ ...fixture, mode: 'future-mode' });
  const model = createParallel({ apiKey: 'test-key', fetch }).decisionModel(
    'future-mode',
  );
  const result = await model.doDecide(options);
  expect(JSON.parse(String(fetch.mock.calls[0]?.[1]?.body)).mode).toBe(
    'future-mode',
  );
  expect(result.providerMetadata?.parallel?.mode).toBe('future-mode');
  expect(result.response?.modelId).toBe('future-mode');
});
