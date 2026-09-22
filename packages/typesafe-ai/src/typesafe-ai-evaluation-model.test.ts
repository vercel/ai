import { readFileSync } from 'node:fs';
import { APICallError, InvalidArgumentError } from '@ai-sdk/provider';
import { createTestServer } from '@ai-sdk/test-server/with-vitest';
import {
  WORKFLOW_SERIALIZE,
  WORKFLOW_DESERIALIZE,
} from '@ai-sdk/provider-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createTypeSafeAi } from './typesafe-ai-provider';
import { EvaluationTypeSafeAiModel } from './typesafe-ai-evaluation-model';
import { VERSION } from './version';

const nativeRequest = JSON.parse(
  readFileSync('src/__fixtures__/evaluation-request.json', 'utf8'),
);
const nativeResponse = JSON.parse(
  readFileSync('src/__fixtures__/evaluation-response.json', 'utf8'),
);
const questions = {
  ...nativeRequest.questions,
  requestsRefund: {
    ...nativeRequest.questions.requestsRefund,
    type: 'boolean' as const,
  },
};
const options = { state: nativeRequest.state, questions };
const url = 'https://api.typesafe.ai/v1/systemone';
const provider = createTypeSafeAi({ apiKey: 'test-api-key' });
const model = provider.evaluationModel('jev-latest');
const server = createTestServer({
  [url]: {},
  'https://custom.example/v1/systemone': {},
});

beforeEach(() => {
  server.urls[url].response = { type: 'json-value', body: nativeResponse };
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

it('sends all three question types and structured rubrics in one request', async () => {
  await model.doEvaluate(options);
  expect(server.calls).toHaveLength(1);
  expect(await server.calls[0].requestBodyJson).toEqual(nativeRequest);
  expect(questions.requestsRefund.type).toBe('boolean');
  expect(server.calls[0].requestHeaders).toMatchObject({
    authorization: 'Bearer test-api-key',
    'content-type': 'application/json',
  });
});

it('preserves native scores, probabilities, confidence metadata, and usage', async () => {
  const result = await model.doEvaluate(options);
  expect(result.answers).toEqual({
    department: {
      type: 'choice',
      choice: 'billing',
      probabilities: { technical: 0, other: 0, billing: 1 },
    },
    severity: {
      type: 'score',
      score: 0.97,
      probabilities: { 0: 0.13, 1: 0.76, 2: 0.11 },
    },
    requestsRefund: { type: 'boolean', probability: 0.99 },
  });
  expect(result.rounding).toEqual({ probabilityDecimals: 2, scoreDecimals: 2 });
  expect(result.providerMetadata).toEqual({
    typesafe: { confidence: { department: 1, severity: 0.64 } },
  });
  expect(result.usage).toEqual({ inputTokens: 471, outputTokens: 71 });
  expect(result.response?.modelId).toBe('jev-1.13.0');
  expect(result.response?.body).toEqual(nativeResponse);
});

it('passes custom fetch, headers, base URL, and future model IDs', async () => {
  const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
    new Response(JSON.stringify(nativeResponse), {
      headers: {
        'content-type': 'application/json',
        'x-request-id': 'test-id',
      },
    }),
  );
  const custom = createTypeSafeAi({
    apiKey: 'custom-key',
    baseURL: 'https://custom.example/v1/',
    fetch: fetchMock,
    headers: { custom: 'provider', shared: 'provider' },
  });
  const result = await custom
    .evaluationModel('jev-future')
    .doEvaluate({ ...options, headers: { shared: 'call' } });
  expect(fetchMock).toHaveBeenCalledTimes(1);
  const [requestUrl, init] = fetchMock.mock.calls[0];
  expect(requestUrl).toBe('https://custom.example/v1/systemone');
  expect(new Headers(init?.headers).get('authorization')).toBe(
    'Bearer custom-key',
  );
  expect(new Headers(init?.headers).get('custom')).toBe('provider');
  expect(new Headers(init?.headers).get('shared')).toBe('call');
  expect(new Headers(init?.headers).get('user-agent')).toContain(
    `ai-sdk-typesafe-ai/${VERSION}`,
  );
  expect(JSON.parse(init?.body as string).model).toBe('jev-future');
  expect(result.response?.headers?.['x-request-id']).toBe('test-id');
});

it('loads TYPESAFE_AI_API_KEY lazily from the environment', async () => {
  const environmentModel = createTypeSafeAi().evaluationModel('jev-latest');
  vi.stubEnv('TYPESAFE_AI_API_KEY', 'environment-key');
  await environmentModel.doEvaluate(options);
  expect(server.calls[0].requestHeaders.authorization).toBe(
    'Bearer environment-key',
  );
});

it('reports unsupported provider options without passing them through', async () => {
  const result = await model.doEvaluate({
    ...options,
    providerOptions: { typesafe: { temperature: 0 } },
  });
  expect(result.warnings).toEqual([
    { type: 'unsupported', feature: 'providerOptions.typesafe.temperature' },
  ]);
  expect(await server.calls[0].requestBodyJson).toEqual(nativeRequest);
});

it.each([
  {
    type: 'choice',
    instructions: 'Pick',
    criteria: Object.fromEntries(
      Array.from({ length: 256 }, (_, index) => [String(index), null]),
    ),
  },
  {
    type: 'score',
    instructions: 'Rate',
    criteria: Array.from({ length: 11 }, (_, index) => `Level ${index}`),
  },
] as const)('rejects provider limits before HTTP for $type', async question => {
  await expect(
    model.doEvaluate({ state: 'test', questions: { question } }),
  ).rejects.toBeInstanceOf(InvalidArgumentError);
  expect(server.calls).toHaveLength(0);
});

describe('HTTP errors', () => {
  it.each([401, 422, 429, 529])(
    'preserves status and retryability for %s',
    async status => {
      server.urls[url].response = {
        type: 'error',
        status,
        body: JSON.stringify({ detail: 'Provider error' }),
      };
      await expect(model.doEvaluate(options)).rejects.toMatchObject({
        name: 'AI_APICallError',
        statusCode: status,
        message: 'Provider error',
        isRetryable: status === 429 || status === 529,
      });
      expect(server.calls).toHaveLength(1);
    },
  );

  it.each([
    { detail: [{ loc: ['body', 'questions'], msg: 'Invalid question' }] },
    { error: { message: 'Overloaded' } },
    { error: 'Overloaded' },
    { message: 'Overloaded' },
  ])('handles provider error envelopes %s', async body => {
    server.urls[url].response = {
      type: 'error',
      status: 422,
      body: JSON.stringify(body),
    };
    await expect(model.doEvaluate(options)).rejects.toMatchObject({
      name: 'AI_APICallError',
      statusCode: 422,
      message: 'detail' in body ? JSON.stringify(body.detail) : 'Overloaded',
    });
  });

  it('surfaces a bare error_type code, observed in production as max_tokens_exceeded', async () => {
    server.urls[url].response = {
      type: 'error',
      status: 400,
      body: JSON.stringify({ error_type: 'max_tokens_exceeded' }),
    };
    await expect(model.doEvaluate(options)).rejects.toMatchObject({
      name: 'AI_APICallError',
      statusCode: 400,
      message: 'max_tokens_exceeded',
    });
  });

  it('prefers a prose field over the error_type code', async () => {
    server.urls[url].response = {
      type: 'error',
      status: 400,
      body: JSON.stringify({
        error_type: 'max_tokens_exceeded',
        message: 'Input exceeds the model context window',
      }),
    };
    await expect(model.doEvaluate(options)).rejects.toMatchObject({
      message: 'Input exceeds the model context window',
    });
  });

  it('still falls back when the body carries no recognised field', async () => {
    server.urls[url].response = {
      type: 'error',
      status: 400,
      body: JSON.stringify({ unrecognised: 'shape' }),
    };
    await expect(model.doEvaluate(options)).rejects.toMatchObject({
      message: 'TypeSafe request failed',
    });
  });

  it('rejects malformed successful responses', async () => {
    server.urls[url].response = {
      type: 'json-value',
      body: { answers: { test: { type: 'noul' } } },
    };
    await expect(model.doEvaluate(options)).rejects.toBeInstanceOf(
      APICallError,
    );
  });
});

it('accepts null optional metadata without inventing usage', async () => {
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
  const result = await model.doEvaluate(options);
  expect(result.usage).toEqual({
    inputTokens: undefined,
    outputTokens: undefined,
  });
  expect(result.response?.modelId).toBe('jev-latest');
  expect(result.providerMetadata).toEqual({ typesafe: { confidence: {} } });
});

it('forwards cancellation to fetch', async () => {
  const controller = new AbortController();
  const reason = new Error('cancelled');
  const fetchMock = vi
    .fn<typeof fetch>()
    .mockImplementation(async (_url, init) => {
      expect(init?.signal).toBe(controller.signal);
      controller.abort(reason);
      throw reason;
    });
  await expect(
    createTypeSafeAi({ apiKey: 'test', fetch: fetchMock })
      .evaluationModel('jev-latest')
      .doEvaluate({ ...options, abortSignal: controller.signal }),
  ).rejects.toBeDefined();
  expect(fetchMock).toHaveBeenCalledTimes(1);
});

it('serializes and restores a model for workflow boundaries', async () => {
  const original = new EvaluationTypeSafeAiModel('jev-latest', {
    provider: 'typesafe.evaluation',
    baseURL: 'https://api.typesafe.ai/v1',
    headers: () => ({ Authorization: 'Bearer restored-key' }),
    fetch: vi.fn(),
  });
  const serialized = EvaluationTypeSafeAiModel[WORKFLOW_SERIALIZE](original);
  expect(serialized.config.fetch).toBeUndefined();
  const restored = EvaluationTypeSafeAiModel[WORKFLOW_DESERIALIZE](
    serialized as unknown as Parameters<
      (typeof EvaluationTypeSafeAiModel)[typeof WORKFLOW_DESERIALIZE]
    >[0],
  );
  await restored.doEvaluate(options);
  expect(server.calls[0].requestHeaders.authorization).toBe(
    'Bearer restored-key',
  );
  expect(restored.supportedQuestionTypes).toEqual([
    'choice',
    'score',
    'boolean',
  ]);
});

it('restores authentication from the environment when no headers are serialized', async () => {
  vi.stubEnv('TYPESAFE_AI_API_KEY', 'workflow-key');
  const restored = EvaluationTypeSafeAiModel[WORKFLOW_DESERIALIZE]({
    modelId: 'jev-latest',
    config: {
      provider: 'typesafe.evaluation',
      baseURL: 'https://api.typesafe.ai/v1',
    },
  });
  await restored.doEvaluate(options);
  expect(server.calls[0].requestHeaders.authorization).toBe(
    'Bearer workflow-key',
  );
});
