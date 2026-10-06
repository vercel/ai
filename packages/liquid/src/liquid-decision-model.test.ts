import { APICallError, UnsupportedFunctionalityError } from '@ai-sdk/provider';
import {
  WORKFLOW_SERIALIZE,
  WORKFLOW_DESERIALIZE,
} from '@ai-sdk/provider-utils';
import { createTestServer } from '@ai-sdk/test-server/with-vitest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DecisionLiquidModel } from './liquid-decision-model';
import { createLiquid } from './liquid-provider';

// Synthetic response following the shapes in Liquid's Decision Models docs.
const response = {
  model: 'd1',
  answers: {
    department: {
      type: 'choice',
      choice: 'billing',
      probabilities: { billing: 0.87654321, technical: 0.12345679 },
      confidence: 0.75308642,
    },
    urgency: {
      type: 'score',
      score: 1.85,
      probabilities: { '0': 0.05, '1': 0.05, '2': 0.9 },
      confidence: 0.8,
      legend: { '0': 'Low', '1': 'Medium', '2': 'High' },
    },
    complaint: { type: 'noul', noul: 0.999 },
  },
  usage: { input_tokens: 248, output_tokens: 0, cost: 0.00000992 },
};
const questions = {
  department: {
    type: 'choice' as const,
    instructions: { task: 'Which team should handle this?' },
    criteria: { billing: ['Payments', 'Refunds'], technical: null },
  },
  urgency: {
    type: 'score' as const,
    instructions: 'How urgent is this?',
    criteria: ['Low', { level: 'Medium' }, 'High'],
  },
  complaint: {
    type: 'boolean' as const,
    instructions: 'Is this a complaint?',
    criteria: { true: 'A complaint', false: null },
  },
};
const nativeQuestions = {
  ...questions,
  complaint: { ...questions.complaint, type: 'noul' },
};
const url = 'https://api.liquid.ai/decisions/v1/systemone';
const server = createTestServer({ [url]: {} });
const model = createLiquid({ apiKey: 'test-key' }).decisionModel('d1');

beforeEach(() => {
  server.urls[url].response = {
    type: 'json-value',
    body: response,
    headers: { 'x-request-id': 'request-id' },
  };
});
afterEach(() => {
  vi.unstubAllEnvs();
});

it.each([
  'The customer is waiting for a refund.',
  { message: 'Refund requested', account: { plan: 'paid' } },
  ['Refund requested', { account: 'paid' }],
])('preserves text and structured state without images: %s', async state => {
  await model.doDecide({ state, questions });
  expect(await server.calls[0].requestBodyJson).toEqual({
    model: 'd1',
    state,
    questions: nativeQuestions,
  });
  expect(questions.complaint.type).toBe('boolean');
});

it('maps native answers, confidence metadata, usage, and response metadata', async () => {
  const result = await model.doDecide({ state: 'Test', questions });
  expect(result.answers).toEqual({
    department: {
      type: 'choice',
      choice: 'billing',
      probabilities: response.answers.department.probabilities,
    },
    urgency: {
      type: 'score',
      score: 1.85,
      probabilities: response.answers.urgency.probabilities,
    },
    complaint: { type: 'boolean', probability: 0.999 },
  });
  expect(result.providerMetadata).toEqual({
    liquid: {
      confidence: { department: 0.75308642, urgency: 0.8 },
      cost: 0.00000992,
    },
  });
  expect(result.usage).toEqual({ inputTokens: 248, outputTokens: 0 });
  expect(result.rounding).toBeUndefined();
  expect(result.response?.modelId).toBe('d1');
  expect(result.response?.headers?.['x-request-id']).toBe('request-id');
  expect(result.response?.body).toEqual(response);
  expect(result.warnings).toEqual([]);
});

describe('reported cost', () => {
  it('preserves zero cost for free decisions', async () => {
    server.urls[url].response = {
      type: 'json-value',
      body: { ...response, usage: { ...response.usage, cost: 0 } },
    };
    const result = await model.doDecide({ state: 'Test', questions });
    expect(result.providerMetadata?.liquid.cost).toBe(0);
  });

  it.each([undefined, null])('omits unavailable cost: %s', async cost => {
    server.urls[url].response = {
      type: 'json-value',
      body: {
        ...response,
        usage: { input_tokens: 248, output_tokens: 0, cost },
      },
    };
    const result = await model.doDecide({ state: 'Test', questions });
    expect(result.providerMetadata?.liquid).not.toHaveProperty('cost');
    expect(result.usage).toEqual({ inputTokens: 248, outputTokens: 0 });
  });
});

describe('state.images', () => {
  it('moves mixed image formats in order and preserves the caller state across calls', async () => {
    const images = [
      'data:image/png;base64,AQID',
      Object.freeze({ content_type: 'image/jpeg', base64: 'BAUG' }),
    ];
    Object.freeze(images);
    const nested = Object.freeze({ images: ['ordinary nested data'] });
    const state = Object.freeze({
      context: 'Inspect these images.',
      nested,
      images,
    });
    for (let i = 0; i < 2; i++) {
      await model.doDecide({ state, questions });
      expect(await server.calls[i].requestBodyJson).toEqual({
        model: 'd1',
        state: { context: 'Inspect these images.', nested },
        images,
        questions: nativeQuestions,
      });
    }
    expect(state.images).toBe(images);
    expect(state.nested).toBe(nested);
  });

  it('keeps calls independent when an image call is followed by a text call', async () => {
    await model.doDecide({
      state: { images: ['data:image/png;base64,AQID'] },
      questions,
    });
    await model.doDecide({ state: 'Text only', questions });
    expect(await server.calls[0].requestBodyJson).toMatchObject({
      state: {},
      images: ['data:image/png;base64,AQID'],
    });
    expect(await server.calls[1].requestBodyJson).not.toHaveProperty('images');
  });

  it('does not extract images from objects nested in an array state', async () => {
    const state = [{ images: ['ordinary data'] }];
    await model.doDecide({ state, questions });
    expect(await server.calls[0].requestBodyJson).toEqual({
      model: 'd1',
      state,
      questions: nativeQuestions,
    });
  });

  it('preserves an empty images array as text state without adding a top-level key', async () => {
    const state = { images: [], context: 'Text only' };
    await model.doDecide({ state, questions });
    expect(await server.calls[0].requestBodyJson).toEqual({
      model: 'd1',
      state,
      questions: nativeQuestions,
    });
  });

  it.each(['png', 'jpeg', 'webp', 'gif'])(
    'accepts both documented representations of image/%s',
    async format => {
      const images = [
        'data:image/' + format + ';base64,AQID',
        { content_type: 'image/' + format, base64: 'BAUG' },
      ];
      await model.doDecide({ state: { images }, questions });
      expect(await server.calls[0].requestBodyJson).toMatchObject({
        state: {},
        images,
      });
    },
  );

  it('accepts the documented maximum of eight images', async () => {
    const images = Array.from(
      { length: 8 },
      () => 'data:image/png;base64,AQID',
    );
    await model.doDecide({ state: { images }, questions });
    expect((await server.calls[0].requestBodyJson).images).toHaveLength(8);
  });

  it.each([
    { images: null },
    { images: 'data:image/png;base64,AQID' },
    { images: ['https://example.com/image.png'] },
    { images: ['data:application/pdf;base64,AQID'] },
    { images: ['data:image/svg+xml;base64,AQID'] },
    { images: ['data:image/png;base64,'] },
    { images: ['data:image/png;base64,invalid!'] },
    { images: [{ content_type: 'image/png', base64: 'invalid!' }] },
    { images: [{ content_type: 'application/pdf', base64: 'AQID' }] },
    { images: [{ content_type: 'image/png' }] },
    { images: [42] },
    { images: Array.from({ length: 9 }, () => 'data:image/png;base64,AQID') },
  ])('rejects invalid images before HTTP: %j', async state => {
    await expect(model.doDecide({ state, questions })).rejects.toMatchObject({
      name: 'AI_InvalidArgumentError',
      argument: 'state.images',
    });
    expect(server.calls).toHaveLength(0);
  });

  it('rejects images on the documented text-only d1:free model before HTTP', async () => {
    await expect(
      createLiquid({ apiKey: 'test' })
        .decisionModel('d1:free')
        .doDecide({
          state: { images: ['data:image/png;base64,AQID'] },
          questions,
        }),
    ).rejects.toBeInstanceOf(UnsupportedFunctionalityError);
    expect(server.calls).toHaveLength(0);
  });

  it('allows text-only calls on d1:free', async () => {
    await createLiquid({ apiKey: 'test' })
      .decisionModel('d1:free')
      .doDecide({ state: 'Test', questions });
    expect(await server.calls[0].requestBodyJson).toMatchObject({
      model: 'd1:free',
      state: 'Test',
    });
  });
});

it('warns about unsupported Liquid provider options', async () => {
  const result = await model.doDecide({
    state: 'Test',
    questions,
    providerOptions: { liquid: { temperature: 0 } },
  });
  expect(result.warnings).toEqual([
    { type: 'unsupported', feature: 'providerOptions.liquid.temperature' },
  ]);
  expect(await server.calls[0].requestBodyJson).not.toHaveProperty(
    'temperature',
  );
});

it('tolerates null optional response fields without inventing usage', async () => {
  server.urls[url].response = {
    type: 'json-value',
    body: {
      model: null,
      usage: null,
      answers: {
        topic: {
          type: 'choice',
          choice: 'a',
          probabilities: { a: 1 },
          confidence: null,
        },
      },
    },
  };
  const result = await model.doDecide({ state: 'Test', questions });
  expect(result.usage).toEqual({
    inputTokens: undefined,
    outputTokens: undefined,
  });
  expect(result.response?.modelId).toBe('d1');
  expect(result.providerMetadata).toEqual({ liquid: { confidence: {} } });
});

describe('errors', () => {
  it.each([400, 401, 422, 429, 500])(
    'preserves HTTP status and retryability for %s',
    async status => {
      server.urls[url].response = {
        type: 'error',
        status,
        body: JSON.stringify({
          message: 'Provider error',
          error_type: 'provider_error',
        }),
      };
      await expect(
        model.doDecide({ state: 'Test', questions }),
      ).rejects.toMatchObject({
        name: 'AI_APICallError',
        message: 'Provider error',
        statusCode: status,
        isRetryable: status === 429 || status === 500,
      });
      expect(server.calls).toHaveLength(1);
    },
  );

  it.each([
    [{ error_type: 'max_tokens_exceeded' }, 'max_tokens_exceeded'],
    [
      { detail: null, error_type: 'max_tokens_exceeded' },
      'max_tokens_exceeded',
    ],
    [{ error: { message: 'Bad image' } }, 'Bad image'],
    [{ detail: [{ msg: 'Bad image' }] }, '[{"msg":"Bad image"}]'],
    [{ detail: 'Bad image' }, 'Bad image'],
    [{ error: 'Bad image' }, 'Bad image'],
    [{ unknown: 'shape' }, 'Liquid request failed'],
  ])('handles error envelopes %j', async (body, message) => {
    server.urls[url].response = {
      type: 'error',
      status: 400,
      body: JSON.stringify(body),
    };
    await expect(
      model.doDecide({ state: 'Test', questions }),
    ).rejects.toMatchObject({ message });
  });

  it('rejects malformed successful responses', async () => {
    server.urls[url].response = {
      type: 'json-value',
      body: { answers: { complaint: { type: 'noul' } } },
    };
    await expect(
      model.doDecide({ state: 'Test', questions }),
    ).rejects.toBeInstanceOf(APICallError);
  });
});

it('forwards cancellation to the configured fetch', async () => {
  const controller = new AbortController();
  const reason = new Error('cancelled');
  const fetch = vi
    .fn<typeof globalThis.fetch>()
    .mockImplementation(async (_url, init) => {
      expect(init?.signal).toBe(controller.signal);
      throw reason;
    });
  await expect(
    createLiquid({ apiKey: 'test', fetch }).decisionModel('d1').doDecide({
      state: 'Test',
      questions,
      abortSignal: controller.signal,
    }),
  ).rejects.toBe(reason);
});

it('serializes and restores a model with image support across workflow boundaries', async () => {
  const original = new DecisionLiquidModel('d1', {
    provider: 'liquid.decision',
    baseURL: 'https://api.liquid.ai/decisions/v1',
    headers: () => ({ Authorization: 'Bearer restored-key' }),
    fetch: vi.fn(),
  });
  const serialized = DecisionLiquidModel[WORKFLOW_SERIALIZE](original);
  expect(serialized.config.fetch).toBeUndefined();
  const restored = DecisionLiquidModel[WORKFLOW_DESERIALIZE](
    serialized as unknown as Parameters<
      (typeof DecisionLiquidModel)[typeof WORKFLOW_DESERIALIZE]
    >[0],
  );
  await restored.doDecide({
    state: { images: ['data:image/png;base64,AQID'] },
    questions,
  });
  expect(server.calls[0].requestHeaders.authorization).toBe(
    'Bearer restored-key',
  );
  expect(await server.calls[0].requestBodyJson).toMatchObject({
    state: {},
    images: ['data:image/png;base64,AQID'],
  });
});

it('restores authentication from LIQUID_API_KEY when headers are absent', async () => {
  vi.stubEnv('LIQUID_API_KEY', 'workflow-key');
  const restored = DecisionLiquidModel[WORKFLOW_DESERIALIZE]({
    modelId: 'd1',
    config: {
      provider: 'liquid.decision',
      baseURL: 'https://api.liquid.ai/decisions/v1',
    },
  });
  await restored.doDecide({ state: 'Test', questions });
  expect(server.calls[0].requestHeaders.authorization).toBe(
    'Bearer workflow-key',
  );
});
