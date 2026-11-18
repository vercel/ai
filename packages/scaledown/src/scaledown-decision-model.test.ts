import {
  APICallError,
  Experimental_DecisionUnsupportedQuestionTypeError,
  InvalidArgumentError,
  NoSuchModelError,
  UnsupportedFunctionalityError,
} from '@ai-sdk/provider';
import {
  WORKFLOW_DESERIALIZE,
  WORKFLOW_SERIALIZE,
} from '@ai-sdk/provider-utils';
import { createTestServer } from '@ai-sdk/test-server/with-vitest';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createScaleDown, scaledown, scaleDown } from './scaledown-provider';
import { DecisionScaleDownModel } from './scaledown-decision-model';
import { VERSION } from './version';

const url = 'https://api.scaledown.xyz/v1/scaledown';
const server = createTestServer({ [url]: {} });
const model = createScaleDown({ apiKey: 'test-key' }).decisionModel(
  'classify-1',
);
const options = {
  state: [{ type: 'text' as const, text: 'The export crashes in Safari.' }],
  questions: {
    category: {
      type: 'choice' as const,
      criteria: { bug: 'Broken functionality', feedback: null },
    },
    workaround: {
      type: 'boolean' as const,
      instructions: 'Is there a workaround?',
    },
    severity: {
      type: 'score' as const,
      criteria: ['Cosmetic', 'Degraded', 'Blocking'],
    },
  },
};
// Based on the official choice, noul, and score examples:
// https://docs.scaledown.ai/api-reference/decisions
const response = {
  model: 'classify-1',
  answers: {
    category: {
      type: 'choice',
      choice: 'bug',
      probabilities: { bug: 0.93, feedback: 0.07 },
      confidence: 0.93,
    },
    workaround: { type: 'noul', noul: 0.79 },
    severity: {
      type: 'score',
      score: 1.43,
      probabilities: { 0: 0, 1: 0.57, 2: 0.43 },
      confidence: 0.57,
      legend: { 0: 'Cosmetic', 1: 'Degraded', 2: 'Blocking' },
    },
  },
  usage: { input_tokens: 103, output_tokens: 3, cost: 0.0000044 },
};

beforeEach(() => {
  server.urls[url].response = { type: 'json-value', body: response };
});
afterEach(() => vi.unstubAllEnvs());

it('maps all three question types, native results, usage, and metadata', async () => {
  const result = await model.doDecide(options);
  expect(await server.calls[0].requestBodyJson).toEqual({
    model: 'classify-1',
    state: { text: 'The export crashes in Safari.' },
    questions: {
      category: {
        type: 'choice',
        criteria: { bug: 'Broken functionality', feedback: 'feedback' },
      },
      workaround: { type: 'noul', instructions: 'Is there a workaround?' },
      severity: options.questions.severity,
    },
  });
  expect(server.calls[0].requestHeaders).toMatchObject({
    'x-api-key': 'test-key',
  });
  expect(result.answers).toEqual({
    category: {
      type: 'choice',
      choice: 'bug',
      probabilities: { bug: 0.93, feedback: 0.07 },
    },
    workaround: { type: 'boolean', probability: 0.79 },
    severity: {
      type: 'score',
      score: 1.43,
      probabilities: { 0: 0, 1: 0.57, 2: 0.43 },
    },
  });
  expect(result.usage).toEqual({ inputTokens: 103, outputTokens: 3 });
  expect(result.providerMetadata).toEqual({
    scaledown: {
      confidence: { category: 0.93, severity: 0.57 },
      legend: { severity: response.answers.severity.legend },
      cost: 0.0000044,
    },
  });
  expect(result.response).toMatchObject({
    modelId: 'classify-1',
    body: response,
  });
  expect(result.warnings).toEqual([]);
});

it('preserves JSON state, structured rubrics, and boolean criteria as text', async () => {
  await model.doDecide({
    state: [{ type: 'json', value: { ticket: 'Export is broken' } }],
    questions: {
      category: {
        type: 'choice',
        instructions: { task: 'Route' },
        criteria: { bug: ['Broken'] },
      },
      workaround: {
        type: 'boolean',
        criteria: {
          true: 'Another browser works',
          false: 'No alternative works',
        },
      },
    },
  });
  expect(await server.calls[0].requestBodyJson).toMatchObject({
    state: { text: '{"ticket":"Export is broken"}' },
    questions: {
      category: {
        instructions: '{"task":"Route"}',
        criteria: { bug: '["Broken"]' },
      },
      workaround: {
        type: 'noul',
        instructions:
          'Answer yes when: Another browser works\nAnswer no when: No alternative works',
      },
    },
  });
});

it('encodes document input alongside text', async () => {
  await model.doDecide({
    ...options,
    state: [
      { type: 'text', text: 'Classify this invoice.' },
      {
        type: 'file',
        mediaType: 'application/pdf',
        data: { type: 'data', data: new Uint8Array([1, 2, 3]) },
      },
    ],
  });
  expect(await server.calls[0].requestBodyJson).toMatchObject({
    state: {
      text: 'Classify this invoice.',
      document: 'AQID',
      document_mime_type: 'application/pdf',
    },
  });
});

it('passes custom settings, call headers, abort signal, and model ID', async () => {
  const fetch = vi
    .fn<typeof globalThis.fetch>()
    .mockResolvedValue(new Response(JSON.stringify(response)));
  const abortSignal = new AbortController().signal;
  await createScaleDown({
    apiKey: async () => 'custom-key',
    baseURL: 'https://custom.example/',
    headers: { shared: 'provider' },
    fetch,
  })
    .decisionModel('classify')
    .doDecide({ ...options, headers: { shared: 'call' }, abortSignal });
  const [requestUrl, init] = fetch.mock.calls[0];
  expect(requestUrl).toBe('https://custom.example/v1/scaledown');
  expect(new Headers(init?.headers).get('x-api-key')).toBe('custom-key');
  expect(new Headers(init?.headers).get('user-agent')).toContain(
    `ai-sdk-scaledown/${VERSION}`,
  );
  expect(new Headers(init?.headers).get('shared')).toBe('call');
  expect(init?.signal).toBe(abortSignal);
  expect(JSON.parse(init?.body as string).model).toBe('classify');
});

it('restores workflow configuration and falls back to environment authentication', async () => {
  vi.stubEnv('SCALEDOWN_API_KEY', 'env-key');
  const serialized = DecisionScaleDownModel[WORKFLOW_SERIALIZE](
    model as DecisionScaleDownModel,
  );
  const restored = DecisionScaleDownModel[WORKFLOW_DESERIALIZE]({
    modelId: serialized.modelId,
    config: {
      provider: 'scaledown.decision',
      baseURL: 'https://api.scaledown.xyz',
    },
  });
  await restored.doDecide(options);
  expect(serialized).toMatchObject({
    modelId: 'classify-1',
    config: { headers: { 'x-api-key': 'test-key' } },
  });
  expect(server.calls[0].requestHeaders['x-api-key']).toBe('env-key');
  await scaledown.decisionModel('classify-1').doDecide(options);
  expect(server.calls[1].requestHeaders['x-api-key']).toBe('env-key');
  expect(restored.supportedQuestionTypes).toEqual([
    'choice',
    'boolean',
    'score',
  ]);
  expect(scaleDown).toBe(scaledown);
});

it('warns about unsupported generation settings and provider options', async () => {
  const result = await model.doDecide({
    ...options,
    maxOutputTokens: 10,
    reasoning: 'high',
    providerOptions: { scaledown: { reasoning: true } },
  });
  expect(result.warnings).toEqual([
    { type: 'unsupported', feature: 'maxOutputTokens' },
    { type: 'unsupported', feature: 'reasoning' },
    { type: 'unsupported', feature: 'providerOptions.scaledown.reasoning' },
  ]);
});

it.each([['Only level'], Array(11).fill('Level'), ['Low', null]])(
  'rejects unsupported score criteria %j before sending a request',
  async (...criteria) => {
    await expect(
      model.doDecide({
        ...options,
        questions: { severity: { type: 'score', criteria } },
      }),
    ).rejects.toBeInstanceOf(InvalidArgumentError);
    expect(server.calls).toHaveLength(0);
  },
);

it('rejects unsupported questions and files before sending a request', async () => {
  await expect(
    model.doDecide({ ...options, questions: { location: { type: 'box' } } }),
  ).rejects.toBeInstanceOf(Experimental_DecisionUnsupportedQuestionTypeError);
  await expect(
    model.doDecide({
      ...options,
      state: [
        {
          type: 'file',
          mediaType: 'audio/wav',
          data: { type: 'data', data: 'AQID' },
        },
      ],
    }),
  ).rejects.toBeInstanceOf(UnsupportedFunctionalityError);
  expect(server.calls).toHaveLength(0);
  for (const factory of [
    'languageModel',
    'embeddingModel',
    'imageModel',
  ] as const) {
    expect(() => scaledown[factory]('unknown')).toThrow(NoSuchModelError);
  }
});

it.each([
  { detail: 'Insufficient credits' },
  { detail: [{ msg: 'Invalid model' }] },
])('surfaces API errors: %j', async body => {
  server.urls[url].response = {
    type: 'error',
    status: 422,
    body: JSON.stringify(body),
    headers: { 'content-type': 'application/json' },
  };
  await expect(model.doDecide(options)).rejects.toMatchObject({
    statusCode: 422,
    message: typeof body.detail === 'string' ? body.detail : body.detail[0].msg,
  });
});

it('rejects a malformed successful response', async () => {
  server.urls[url].response = {
    type: 'json-value',
    body: { answers: { category: { type: 'choice' } } },
  };
  await expect(model.doDecide(options)).rejects.toBeInstanceOf(APICallError);
});
