import {
  APICallError,
  InvalidArgumentError,
  InvalidResponseDataError,
  NoSuchProviderReferenceError,
  UnsupportedFunctionalityError,
  Experimental_DecisionUnsupportedQuestionTypeError as DecisionUnsupportedQuestionTypeError,
  type Experimental_DecisionModelV4CallOptions as DecisionModelV4CallOptions,
  type Experimental_DecisionModelV4StatePart as DecisionModelV4StatePart,
} from '@ai-sdk/provider';
import {
  WORKFLOW_DESERIALIZE,
  WORKFLOW_SERIALIZE,
} from '@ai-sdk/provider-utils';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DecisionHeyGenModel } from './heygen-decision-model';
import { createHeyGen } from './heygen-provider';

// Illustrative response from HeyGen's Decision documentation, not a live capture.
const fixture = {
  data: {
    id: 'decision-0123456789abcdef',
    request_id: '0123456789abcdef0123456789abcdef',
    model: 'heygen-decision-1',
    answers: {
      blocked: { type: 'noul', noul: 0.96 },
      team: {
        type: 'choice',
        choice: 'video',
        probabilities: { video: 0.8, account: 0.15, billing: 0.05 },
        confidence: 0.7,
      },
      impact: {
        type: 'score',
        score: 1.75,
        probabilities: { '0': 0.05, '1': 0.15, '2': 0.8 },
        legend: { '0': 'Cosmetic', '1': 'Slower', '2': 'Blocked' },
        confidence: 0.625,
      },
    },
    usage: { input_tokens: 1200, output_tokens: 0 },
  },
};

const options = {
  state: [{ type: 'text', text: 'Video export fails for everyone.' }],
  questions: {
    blocked: {
      type: 'boolean',
      instructions: 'Is the customer unable to work?',
      criteria: null,
    },
    team: {
      type: 'choice',
      instructions: 'Which team should handle this request?',
      criteria: { video: 'Rendering', account: 'Access', billing: 'Payments' },
    },
    impact: {
      type: 'score',
      instructions: 'How much does this affect the customer?',
      criteria: ['Cosmetic', 'Slower', 'Blocked'],
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
  const provider = createHeyGen({
    apiKey: 'test-key',
    baseURL: 'https://example.com/',
    headers: { 'x-provider': 'custom', shared: 'provider' },
    fetch,
  });
  return {
    provider,
    model: provider.decisionModel('heygen-decision-1'),
    fetch,
  };
}

function requestBody(fetch: ReturnType<typeof setup>['fetch']) {
  return JSON.parse(fetch.mock.calls[0][1]?.body as string);
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

it('sends one native request with all question types and configured headers', async () => {
  const { model, fetch } = setup();
  await model.doDecide({ ...options, headers: { shared: 'call' } });
  expect(model).toMatchObject({
    specificationVersion: 'v4',
    provider: 'heygen.decision',
    modelId: 'heygen-decision-1',
    supportedQuestionTypes: ['choice', 'score', 'boolean'],
  });
  expect(fetch).toHaveBeenCalledTimes(1);
  const [url, request] = fetch.mock.calls[0];
  expect(url).toBe('https://example.com/v3/models/decisions');
  const headers = new Headers(request?.headers);
  expect(Object.fromEntries(headers)).toMatchObject({
    'x-api-key': 'test-key',
    'content-type': 'application/json',
    'x-provider': 'custom',
    shared: 'call',
  });
  expect(headers.get('user-agent')).toContain('ai-sdk-heygen/');
  expect(requestBody(fetch)).toEqual({
    model: 'heygen-decision-1',
    state: 'Video export fails for everyone.',
    questions: {
      blocked: {
        type: 'noul',
        instructions: options.questions.blocked.instructions,
      },
      team: options.questions.team,
      impact: options.questions.impact,
    },
  });
});

it('maps answers and preserves confidence, legends, warnings, usage and response metadata', async () => {
  const body = structuredClone(fixture);
  Object.assign(body.data.answers.blocked, { warning: 'Low evidence' });
  const result = await setup(body).model.doDecide(options);
  expect(result.answers).toEqual({
    blocked: { type: 'boolean', probability: 0.96 },
    team: {
      type: 'choice',
      choice: 'video',
      probabilities: fixture.data.answers.team.probabilities,
    },
    impact: {
      type: 'score',
      score: 1.75,
      probabilities: fixture.data.answers.impact.probabilities,
    },
  });
  expect(result.rounding).toBeUndefined();
  expect(result.usage).toEqual({ inputTokens: 1200, outputTokens: 0 });
  expect(result.warnings).toEqual([]);
  expect(result.providerMetadata).toEqual({
    heygen: {
      requestId: fixture.data.request_id,
      confidence: { team: 0.7, impact: 0.625 },
      legend: { impact: fixture.data.answers.impact.legend },
      answerWarnings: { blocked: 'Low evidence' },
    },
  });
  expect(result.response).toMatchObject({
    id: fixture.data.id,
    modelId: 'heygen-decision-1',
    headers: { 'x-trace': 'trace-1' },
    body,
  });
});

it('tolerates absent ancillary response fields', async () => {
  const result = await setup({
    data: { answers: fixture.data.answers },
  }).model.doDecide(options);
  expect(result.usage).toBeUndefined();
  expect(result.response).toMatchObject({
    id: undefined,
    modelId: 'heygen-decision-1',
  });
  expect(result.providerMetadata?.heygen.requestId).toBeUndefined();
});

it('sends file parts as ordered image and video assets and keeps text and JSON in state', async () => {
  const { model, fetch } = setup({
    data: { answers: { blocked: fixture.data.answers.blocked } },
  });
  await model.doDecide({
    state: [
      { type: 'text', text: 'Compare the first image with the video.' },
      {
        type: 'file',
        mediaType: 'image',
        data: {
          type: 'data',
          data: new Uint8Array([
            0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
          ]),
        },
      },
      {
        type: 'file',
        mediaType: 'video/mp4',
        data: { type: 'url', url: new URL('https://example.com/clip.mp4') },
      },
      {
        type: 'file',
        mediaType: 'image/jpeg',
        data: { type: 'reference', reference: { heygen: 'asset-123' } },
      },
      { type: 'json', value: { product: 'vase' } },
    ],
    questions: { blocked: options.questions.blocked },
  });
  expect(requestBody(fetch)).toMatchObject({
    state: ['Compare the first image with the video.', { product: 'vase' }],
    assets: {
      images: {
        'image-1': {
          type: 'base64',
          media_type: 'image/png',
          data: 'iVBORw0KGgo=',
        },
        'image-2': { type: 'asset_id', asset_id: 'asset-123' },
      },
      videos: {
        'video-1': { type: 'url', url: 'https://example.com/clip.mp4' },
      },
    },
  });
});

it.each<[string, DecisionModelV4StatePart[], new (...args: never[]) => Error]>([
  [
    'more than four images',
    Array.from({ length: 5 }, () => ({
      type: 'file' as const,
      mediaType: 'image/png',
      data: { type: 'data' as const, data: 'iVBORw0KGgo=' },
    })),
    InvalidArgumentError,
  ],
  [
    'more than one video',
    Array.from({ length: 2 }, () => ({
      type: 'file' as const,
      mediaType: 'video/mp4',
      data: { type: 'url' as const, url: new URL('https://example.com/a.mp4') },
    })),
    InvalidArgumentError,
  ],
  [
    'non-HTTPS URLs',
    [
      {
        type: 'file',
        mediaType: 'image/png',
        data: { type: 'url', url: new URL('http://example.com/a.png') },
      },
    ],
    InvalidArgumentError,
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
    InvalidArgumentError,
  ],
  [
    'non-image, non-video media',
    [
      {
        type: 'file',
        mediaType: 'application/pdf',
        data: { type: 'data', data: 'JVBERi0=' },
      },
    ],
    UnsupportedFunctionalityError,
  ],
  [
    'inline text files',
    [
      {
        type: 'file',
        mediaType: 'image/png',
        data: { type: 'text', text: 'not an image' },
      },
    ],
    UnsupportedFunctionalityError,
  ],
  [
    'references without a HeyGen asset',
    [
      {
        type: 'file',
        mediaType: 'image/png',
        data: { type: 'reference', reference: { other: 'file-1' } },
      },
    ],
    NoSuchProviderReferenceError,
  ],
])('rejects %s before HTTP', async (_, state, error) => {
  const { model, fetch } = setup();
  await expect(model.doDecide({ ...options, state })).rejects.toBeInstanceOf(
    error,
  );
  expect(fetch).not.toHaveBeenCalled();
});

describe('request limits', () => {
  it.each<DecisionModelV4CallOptions['questions']>([
    {},
    ...['', ' padded', 'a:b', 'a\nb'].map(id => ({
      [id]: options.questions.blocked,
    })),
    Object.fromEntries(
      Array.from({ length: 401 }, (_, i) => [
        String(i),
        options.questions.blocked,
      ]),
    ),
    { team: { ...options.questions.team, criteria: {} } },
    {
      team: {
        ...options.questions.team,
        criteria: Object.fromEntries(
          Array.from({ length: 256 }, (_, i) => [String(i), null]),
        ),
      },
    },
    { impact: { ...options.questions.impact, criteria: [] } },
    { impact: { ...options.questions.impact, criteria: ['Low', null] } },
    {
      impact: {
        ...options.questions.impact,
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

  it('accepts the maximum question count and a single-level score', async () => {
    const questions = {
      ...Object.fromEntries(
        Array.from({ length: 399 }, (_, i) => [
          String(i),
          options.questions.blocked,
        ]),
      ),
      single: { type: 'score', instructions: 'Rate', criteria: ['Only'] },
    } as const;
    const { model, fetch } = setup({
      data: {
        answers: {
          ...Object.fromEntries(
            Array.from({ length: 399 }, (_, i) => [
              String(i),
              fixture.data.answers.blocked,
            ]),
          ),
          single: { type: 'score', score: 0, probabilities: { '0': 1 } },
        },
      },
    });
    await model.doDecide({ ...options, questions });
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(Object.keys(requestBody(fetch).questions)).toHaveLength(400);
  });

  it('rejects box questions', async () => {
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

it('warns about unsupported settings without adding fields to the request', async () => {
  const { model, fetch } = setup();
  const result = await model.doDecide({
    ...options,
    maxOutputTokens: 10,
    reasoning: 'low',
    providerOptions: { heygen: { temperature: 0 } },
  });
  expect(result.warnings).toEqual([
    { type: 'unsupported', feature: 'maxOutputTokens' },
    { type: 'unsupported', feature: 'reasoning' },
    { type: 'unsupported', feature: 'providerOptions.heygen.temperature' },
  ]);
  expect(Object.keys(requestBody(fetch))).toEqual([
    'model',
    'state',
    'questions',
  ]);
});

it.each([
  {},
  { ...fixture.data.answers, extra: fixture.data.answers.blocked },
  { team: fixture.data.answers.team, impact: fixture.data.answers.impact },
])('rejects missing and unexpected answers', async answers => {
  await expect(
    setup({ data: { answers } }).model.doDecide(options),
  ).rejects.toBeInstanceOf(InvalidResponseDataError);
});

it.each([
  { ...fixture.data.answers, blocked: { type: 'noul', noul: 1.01 } },
  { ...fixture.data.answers, team: { type: 'choice', choice: 'video' } },
  { ...fixture.data.answers, blocked: { type: 'refusal' } },
])('rejects malformed native responses', async answers => {
  await expect(
    setup({ data: { answers } }).model.doDecide(options),
  ).rejects.toBeInstanceOf(APICallError);
});

it('preserves HeyGen error codes and parameters', async () => {
  const result = Promise.resolve(
    setup(
      {
        error: {
          code: 'invalid_parameter',
          message: 'Invalid question.',
          param: 'questions.team.criteria',
        },
      },
      400,
    ).model.doDecide(options),
  );
  await expect(result).rejects.toBeInstanceOf(APICallError);
  await expect(result).rejects.toMatchObject({
    message: 'Invalid question. (invalid_parameter) [questions.team.criteria]',
    statusCode: 400,
  });
});

it('loads environment authentication lazily and uses the default endpoint', async () => {
  const { fetch } = setup();
  const model = createHeyGen({ fetch }).decisionModel(
    'heygen-decision-1-turbo',
  );
  vi.stubEnv('HEYGEN_API_KEY', 'environment-key');
  await model.doDecide(options);
  expect(fetch.mock.calls[0][0]).toBe(
    'https://api.heygen.com/v3/models/decisions',
  );
  expect(new Headers(fetch.mock.calls[0][1]?.headers).get('x-api-key')).toBe(
    'environment-key',
  );
  expect(requestBody(fetch).model).toBe('heygen-decision-1-turbo');
});

it('restores the endpoint and authentication across workflow serialization', async () => {
  const { model, fetch } = setup();
  const serialized = DecisionHeyGenModel[WORKFLOW_SERIALIZE](
    model as DecisionHeyGenModel,
  );
  expect(serialized.config.fetch).toBeUndefined();
  vi.stubGlobal('fetch', fetch);
  const restored = DecisionHeyGenModel[WORKFLOW_DESERIALIZE]({
    modelId: serialized.modelId,
    config: serialized.config as unknown as Parameters<
      (typeof DecisionHeyGenModel)[typeof WORKFLOW_DESERIALIZE]
    >[0]['config'],
  });
  await restored.doDecide(options);
  expect(fetch.mock.calls[0][0]).toBe(
    'https://example.com/v3/models/decisions',
  );
  expect(new Headers(fetch.mock.calls[0][1]?.headers).get('x-api-key')).toBe(
    'test-key',
  );
});
