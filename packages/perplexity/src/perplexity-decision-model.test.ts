import {
  APICallError,
  InvalidArgumentError,
  InvalidResponseDataError,
  Experimental_DecisionUnsupportedQuestionTypeError as DecisionUnsupportedQuestionTypeError,
  type Experimental_DecisionModelV4CallOptions as DecisionModelV4CallOptions,
} from '@ai-sdk/provider';
import {
  WORKFLOW_DESERIALIZE,
  WORKFLOW_SERIALIZE,
} from '@ai-sdk/provider-utils';
import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createPerplexity } from './perplexity-provider';
import { DecisionPerplexityModel } from './perplexity-decision-model';

// Illustrative response from the official OpenAPI schema, not a live capture.
const fixture = JSON.parse(
  readFileSync('src/__fixtures__/decisions.json', 'utf8'),
);
const options = {
  state: [
    { type: 'json', value: { review: 'Great sound, but the battery broke.' } },
  ],
  questions: {
    defect: {
      type: 'boolean',
      instructions: 'Does the review report a defect?',
    },
    sentiment: {
      type: 'choice',
      instructions: 'What is the sentiment?',
      criteria: {
        positive: 'Satisfied',
        mixed: 'Praise and complaints',
        negative: 'Dissatisfied',
      },
    },
    severity: {
      type: 'score',
      instructions: 'How severe is the problem?',
      criteria: ['Cosmetic', 'Inconvenient', 'Product unusable'],
    },
  },
} as const satisfies DecisionModelV4CallOptions;

function setup(body: unknown = fixture, status = 200) {
  const fetch = vi.fn<typeof globalThis.fetch>().mockImplementation(
    async () =>
      new Response(typeof body === 'string' ? body : JSON.stringify(body), {
        status,
        statusText: status === 504 ? 'Gateway Timeout' : 'Bad Request',
        headers: {
          'content-type': 'application/json',
          'x-request-id': 'request-123',
          'retry-after': '2',
          'x-ratelimit-remaining': '9',
        },
      }),
  );
  const provider = createPerplexity({
    apiKey: 'test-key',
    baseURL: 'https://example.com/',
    headers: { 'x-provider': 'custom', shared: 'provider' },
    fetch,
  });
  return {
    provider,
    model: provider.decisionModel('pplx-decider-latest'),
    fetch,
  };
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

it('sends one native request with all question types and configured headers', async () => {
  const { model, fetch } = setup();
  await model.doDecide({ ...options, headers: { shared: 'call' } });
  expect(model.specificationVersion).toBe('v4');
  expect(model.provider).toBe('perplexity.decision');
  expect(model.supportedQuestionTypes).toEqual(['choice', 'score', 'boolean']);
  expect(fetch).toHaveBeenCalledTimes(1);
  const [url, request] = fetch.mock.calls[0];
  expect(url).toBe('https://example.com/v1/decisions');
  expect(Object.fromEntries(new Headers(request?.headers))).toMatchObject({
    authorization: 'Bearer test-key',
    'content-type': 'application/json',
    'x-provider': 'custom',
    shared: 'call',
    'x-pplx-integration': 'vercel-ai-sdk',
  });
  expect(new Headers(request?.headers).get('user-agent')).toContain(
    'ai-sdk-perplexity/',
  );
  expect(JSON.parse(request?.body as string)).toEqual({
    model: 'pplx-decider-latest',
    state: options.state[0].value,
    questions: {
      ...options.questions,
      defect: { ...options.questions.defect, type: 'noul' },
    },
  });
});

it('preserves native precision, confidence, legends, usage and response metadata', async () => {
  const result = await setup().model.doDecide(options);
  expect(result.answers).toEqual({
    defect: { type: 'boolean', probability: fixture.answers.defect.noul },
    sentiment: {
      type: 'choice',
      choice: 'mixed',
      probabilities: fixture.answers.sentiment.probabilities,
    },
    severity: {
      type: 'score',
      score: fixture.answers.severity.score,
      probabilities: fixture.answers.severity.probabilities,
    },
  });
  expect(result.rounding).toBeUndefined();
  expect(result.usage).toEqual({ inputTokens: 367, outputTokens: 3 });
  expect(result.providerMetadata).toEqual({
    perplexity: {
      confidence: {
        sentiment: fixture.answers.sentiment.confidence,
        severity: fixture.answers.severity.confidence,
      },
      legend: { severity: fixture.answers.severity.legend },
    },
  });
  expect(result.response).toMatchObject({
    id: 'request-123',
    modelId: 'pplx-decider-latest',
    body: fixture,
    headers: { 'x-request-id': 'request-123', 'x-ratelimit-remaining': '9' },
  });
});

it('preserves structured instructions, rubrics and optional boolean criteria', async () => {
  const { model, fetch } = setup();
  const questions = {
    defect: {
      type: 'boolean',
      instructions: { task: 'Check for defects' },
      criteria: { true: ['Broken'], false: null },
    },
    sentiment: {
      type: 'choice',
      instructions: ['Classify'],
      criteria: {
        positive: { description: 'Satisfied' },
        mixed: ['Praise', 'Complaints'],
        negative: null,
      },
    },
    severity: {
      type: 'score',
      instructions: { task: 'Rate' },
      criteria: [{ impact: 'None' }, ['Some'], 'Blocking'],
    },
  } as const;
  await model.doDecide({ ...options, questions });
  expect(JSON.parse(fetch.mock.calls[0][1]?.body as string).questions).toEqual({
    ...questions,
    defect: { ...questions.defect, type: 'noul' },
  });
});

it('preserves structured score legends in provider metadata', async () => {
  const legend = { '0': { impact: 'none' }, '1': ['partial'], '2': 'blocking' };
  const body = structuredClone(fixture);
  body.answers.severity.legend = legend;
  const result = await setup(body).model.doDecide(options);
  expect(result.providerMetadata?.perplexity.legend).toEqual({
    severity: legend,
  });
});

it('warns about unsupported options without adding fields to the request', async () => {
  const { model, fetch } = setup();
  const result = await model.doDecide({
    ...options,
    providerOptions: {
      perplexity: { temperature: 0, searchDomainFilter: ['example.com'] },
    },
  });
  expect(result.warnings).toEqual([
    { type: 'unsupported', feature: 'providerOptions.perplexity.temperature' },
    {
      type: 'unsupported',
      feature: 'providerOptions.perplexity.searchDomainFilter',
    },
  ]);
  expect(
    Object.keys(JSON.parse(fetch.mock.calls[0][1]?.body as string)),
  ).toEqual(['model', 'state', 'questions']);
});

it.each([
  'pplx-decider-v1.2',
  'pplx-decider-flash-v1.2',
  'pplx-decider-latest',
  'pplx-decider-flash-latest',
  'perplexity/pplx-decider-latest',
  'perplexity/pplx-decider-flash-latest',
  'pplx-decider-v1.1-27b',
  'pplx-decider-v1-27b',
  'future-model',
])('passes model ID %s through without resolving aliases', async modelId => {
  const { provider, fetch } = setup({ ...fixture, model: modelId });
  const result = await provider.decisionModel(modelId).doDecide(options);
  expect(JSON.parse(fetch.mock.calls[0][1]?.body as string).model).toBe(
    modelId,
  );
  expect(result.response?.modelId).toBe(modelId);
});

it('loads environment authentication lazily and uses the default endpoint', async () => {
  const { fetch } = setup();
  const model = createPerplexity({ fetch }).decisionModel(
    'pplx-decider-latest',
  );
  vi.stubEnv('PERPLEXITY_API_KEY', 'environment-key');
  await model.doDecide(options);
  expect(fetch.mock.calls[0][0]).toBe('https://api.perplexity.ai/v1/decisions');
  expect(
    new Headers(fetch.mock.calls[0][1]?.headers).get('authorization'),
  ).toBe('Bearer environment-key');
});

it('restores the endpoint and authentication across workflow serialization', async () => {
  const { model, fetch } = setup();
  const serialized = DecisionPerplexityModel[WORKFLOW_SERIALIZE](
    model as DecisionPerplexityModel,
  );
  expect(serialized.config.fetch).toBeUndefined();
  expect(serialized.config.headers).toMatchObject({
    authorization: 'Bearer test-key',
  });
  vi.stubGlobal('fetch', fetch);
  const restored = DecisionPerplexityModel[WORKFLOW_DESERIALIZE]({
    modelId: serialized.modelId,
    config: serialized.config as unknown as Parameters<
      (typeof DecisionPerplexityModel)[typeof WORKFLOW_DESERIALIZE]
    >[0]['config'],
  });
  await restored.doDecide(options);
  expect(fetch.mock.calls[0][0]).toBe('https://example.com/v1/decisions');
  expect(
    new Headers(fetch.mock.calls[0][1]?.headers).get('authorization'),
  ).toBe('Bearer test-key');
});

describe('request limits', () => {
  it.each<DecisionModelV4CallOptions['questions']>([
    {},
    { '': options.questions.defect },
    Object.fromEntries(
      Array.from({ length: 129 }, (_, i) => [
        String(i),
        options.questions.defect,
      ]),
    ),
    { sentiment: { ...options.questions.sentiment, criteria: {} } },
    {
      sentiment: {
        ...options.questions.sentiment,
        criteria: Object.fromEntries(
          Array.from({ length: 256 }, (_, i) => [String(i), null]),
        ),
      },
    },
    { severity: { ...options.questions.severity, criteria: [] } },
    { severity: { ...options.questions.severity, criteria: ['Low', null] } },
    {
      severity: {
        ...options.questions.severity,
        criteria: Array.from({ length: 11 }, (_, i) => String(i)),
      },
    },
  ])('rejects invalid provider limits before HTTP', async questions => {
    const { model, fetch } = setup();
    await expect(
      model.doDecide({ ...options, questions }),
    ).rejects.toBeInstanceOf(InvalidArgumentError);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('accepts the maximum question, choice and score counts without splitting', async () => {
    const questions = Object.fromEntries(
      Array.from({ length: 126 }, (_, i) => [
        String(i),
        options.questions.defect,
      ]),
    );
    const choice = {
      type: 'choice',
      instructions: 'Pick',
      criteria: Object.fromEntries(
        Array.from({ length: 255 }, (_, i) => [String(i), null]),
      ),
    } as const;
    const score = {
      type: 'score',
      instructions: 'Rate',
      criteria: Array.from({ length: 10 }, (_, i) => String(i)),
    } as const;
    const answers = Object.fromEntries(
      Object.keys(questions).map(id => [id, fixture.answers.defect]),
    );
    const { model, fetch } = setup({
      answers: {
        ...answers,
        choice: {
          type: 'choice',
          choice: '0',
          probabilities: Object.fromEntries(
            Object.keys(choice.criteria).map(id => [id, id === '0' ? 1 : 0]),
          ),
        },
        score: {
          type: 'score',
          score: 0,
          probabilities: Object.fromEntries(
            score.criteria.map(id => [id, id === '0' ? 1 : 0]),
          ),
        },
      },
    });
    await model.doDecide({
      ...options,
      questions: { ...questions, choice, score },
    });
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(
      Object.keys(JSON.parse(fetch.mock.calls[0][1]?.body as string).questions),
    ).toHaveLength(128);
  });

  it('rejects box questions on direct provider calls', async () => {
    const { model, fetch } = setup();
    await expect(
      model.doDecide({
        ...options,
        questions: { box: { type: 'box', instructions: 'Find the product' } },
      }),
    ).rejects.toBeInstanceOf(DecisionUnsupportedQuestionTypeError);
    expect(fetch).not.toHaveBeenCalled();
  });
});

it.each([
  {},
  { ...fixture.answers, extra: fixture.answers.defect },
  { ...fixture.answers, defect: undefined },
])('rejects missing and unexpected answers', async answers => {
  await expect(
    setup({ answers }).model.doDecide(options),
  ).rejects.toBeInstanceOf(InvalidResponseDataError);
});

it.each([
  { ...fixture.answers, defect: { type: 'noul', noul: 1.01 } },
  { ...fixture.answers, sentiment: { type: 'choice', choice: 'mixed' } },
  {
    ...fixture.answers,
    severity: { ...fixture.answers.severity, probabilities: { 0: -1 } },
  },
  { ...fixture.answers, defect: { type: 'refusal' } },
])('rejects malformed native responses', async answers => {
  await expect(
    setup({ answers }).model.doDecide(options),
  ).rejects.toBeInstanceOf(APICallError);
});

it.each([undefined, null])(
  'tolerates absent or null ancillary response fields',
  async value => {
    const body = structuredClone(fixture);
    body.model = value;
    body.usage = value;
    body.answers.sentiment.confidence = value;
    body.answers.severity.confidence = value;
    body.answers.severity.legend = value;
    const result = await setup(body).model.doDecide(options);
    expect(result.usage).toBeUndefined();
    expect(result.response?.modelId).toBe('pplx-decider-latest');
    expect(result.providerMetadata).toEqual({
      perplexity: { confidence: {}, legend: {} },
    });
  },
);

it('preserves zero usage and confidence', async () => {
  const body = structuredClone(fixture);
  body.usage = { input_tokens: 0, output_tokens: null };
  body.answers.sentiment.confidence = 0;
  const result = await setup(body).model.doDecide(options);
  expect(result.usage).toEqual({ inputTokens: 0, outputTokens: undefined });
  expect(result.providerMetadata?.perplexity.confidence).toMatchObject({
    sentiment: 0,
  });
});

it.each([null, '400', 401])(
  'preserves error messages with code %s',
  async code => {
    await expect(
      setup(
        {
          error: {
            code,
            message: 'Invalid model',
            type: 'invalid_request_error',
            param: null,
          },
        },
        400,
      ).model.doDecide(options),
    ).rejects.toMatchObject({
      message: 'Invalid model',
      statusCode: 400,
      isRetryable: false,
    });
  },
);

it.each([404, 405, 413, 429, 500, 502, 503, 504])(
  'preserves HTTP status %s and retry headers even with non-JSON errors',
  async status => {
    await expect(
      setup(
        status === 504 ? '<html>Gateway Timeout</html>' : '',
        status,
      ).model.doDecide(options),
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
    createPerplexity({ apiKey: 'test', fetch })
      .decisionModel('pplx-decider-latest')
      .doDecide({ ...options, abortSignal: controller.signal }),
  ).rejects.toThrow('Cancelled');
  expect(fetch).toHaveBeenCalledTimes(1);
});

it.each([{}, { instructions: undefined }, { instructions: null }])(
  'preserves criteria-only questions on the wire with %j',
  async instructionFields => {
    const { model, fetch } = setup();
    const questions = {
      defect: {
        type: 'boolean',
        criteria: { true: ['Broken'], false: null },
        ...instructionFields,
      },
      sentiment: {
        type: 'choice',
        criteria: options.questions.sentiment.criteria,
        ...instructionFields,
      },
      severity: {
        type: 'score',
        criteria: options.questions.severity.criteria,
        ...instructionFields,
      },
    } as const;
    await model.doDecide({ ...options, questions });
    expect(
      JSON.parse(fetch.mock.calls[0][1]?.body as string).questions,
    ).toStrictEqual(
      JSON.parse(
        JSON.stringify({
          ...questions,
          defect: { ...questions.defect, type: 'noul' },
        }),
      ),
    );
  },
);

it('sends a single Score level and preserves its zero score and unit probability', async () => {
  const { model, fetch } = setup({
    model: 'pplx-decider-latest',
    answers: {
      severity: {
        type: 'score',
        score: 0,
        probabilities: { '0': 1 },
        confidence: 1,
        legend: { '0': 'Product unusable' },
      },
    },
  });
  const questions = {
    severity: { type: 'score', criteria: ['Product unusable'] },
  } as const;
  const result = await model.doDecide({ ...options, questions });
  expect(fetch).toHaveBeenCalledTimes(1);
  expect(JSON.parse(fetch.mock.calls[0][1]?.body as string).questions).toEqual(
    questions,
  );
  expect(result.answers).toEqual({
    severity: { type: 'score', score: 0, probabilities: { '0': 1 } },
  });
  expect(result.providerMetadata).toEqual({
    perplexity: {
      confidence: { severity: 1 },
      legend: { severity: { '0': 'Product unusable' } },
    },
  });
});
