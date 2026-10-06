import { readFileSync } from 'node:fs';
import { APICallError } from '@ai-sdk/provider';
import { createTestServer } from '@ai-sdk/test-server/with-vitest';
import {
  WORKFLOW_SERIALIZE,
  WORKFLOW_DESERIALIZE,
} from '@ai-sdk/provider-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createPerplexity } from '../perplexity-provider';
import { PerplexityDecisionModel } from './perplexity-decision-model';
import { VERSION } from '../version';

const nativeRequest = JSON.parse(
  readFileSync('src/__fixtures__/decision-request.json', 'utf8'),
);
const nativeResponse = JSON.parse(
  readFileSync('src/__fixtures__/decision-response.json', 'utf8'),
);
const questions = {
  ...nativeRequest.questions,
  requestsRefund: {
    ...nativeRequest.questions.requestsRefund,
    type: 'boolean' as const,
  },
};
const options = { state: nativeRequest.state, questions };
const url = 'https://api.perplexity.ai/decisions';
const provider = createPerplexity({ apiKey: 'test-api-key' });
const model = provider.decisionModel('pplx-decider-v1-27b');
const server = createTestServer({
  [url]: {},
  'https://custom.example/decisions': {},
});

beforeEach(() => {
  server.urls[url].response = { type: 'json-value', body: nativeResponse };
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

it('sends all three question types and structured rubrics in one request', async () => {
  await model.doDecide(options);
  expect(server.calls).toHaveLength(1);
  expect(await server.calls[0].requestBodyJson).toEqual(nativeRequest);
  expect(questions.requestsRefund.type).toBe('boolean');
  expect(server.calls[0].requestHeaders).toMatchObject({
    authorization: 'Bearer test-api-key',
    'content-type': 'application/json',
    'x-pplx-integration': 'vercel-ai-sdk',
  });
});

it('preserves native scores, probabilities, and usage', async () => {
  const result = await model.doDecide(options);
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
  expect(result.usage).toEqual({ inputTokens: 471, outputTokens: 71 });
  expect(result.response?.modelId).toBe('pplx-decider-v1-27b');
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
  const custom = createPerplexity({
    apiKey: 'custom-key',
    baseURL: 'https://custom.example/',
    fetch: fetchMock,
    headers: { custom: 'provider', shared: 'provider' },
  });
  const result = await custom
    .decisionModel('pplx-decider-v1.1-27b')
    .doDecide({ ...options, headers: { shared: 'call' } });
  expect(fetchMock).toHaveBeenCalledTimes(1);
  const [requestUrl, init] = fetchMock.mock.calls[0];
  expect(requestUrl).toBe('https://custom.example/decisions');
  expect(new Headers(init?.headers).get('authorization')).toBe(
    'Bearer custom-key',
  );
  expect(new Headers(init?.headers).get('custom')).toBe('provider');
  expect(new Headers(init?.headers).get('shared')).toBe('call');
  expect(new Headers(init?.headers).get('user-agent')).toContain(
    `ai-sdk-perplexity/${VERSION}`,
  );
  expect(JSON.parse(init?.body as string).model).toBe('pplx-decider-v1.1-27b');
  expect(result.response?.headers?.['x-request-id']).toBe('test-id');
});

describe('HTTP errors', () => {
  it.each([401, 422, 429, 529])(
    'preserves status and retryability for %s',
    async status => {
      server.urls[url].response = {
        type: 'error',
        status,
        body: JSON.stringify({ error: { message: 'Provider error' } }),
      };
      await expect(model.doDecide(options)).rejects.toMatchObject({
        name: 'AI_APICallError',
        statusCode: status,
        isRetryable: status === 429 || status === 529,
      });
      expect(server.calls).toHaveLength(1);
    },
  );

  it('handles provider error envelopes', async () => {
    server.urls[url].response = {
      type: 'error',
      status: 422,
      body: JSON.stringify({ error: { message: 'Overloaded' } }),
    };
    await expect(model.doDecide(options)).rejects.toMatchObject({
      name: 'AI_APICallError',
      statusCode: 422,
    });
  });

  it('rejects malformed successful responses', async () => {
    server.urls[url].response = {
      type: 'json-value',
      body: { answers: { test: { type: 'noul' } } },
    };
    await expect(model.doDecide(options)).rejects.toBeInstanceOf(APICallError);
  });
});

it('accepts nullish usage tokens', async () => {
  server.urls[url].response = {
    type: 'json-value',
    body: {
      model: 'pplx-decider-v1-27b',
      usage: {
        input_tokens: null,
        output_tokens: null,
      },
      answers: {
        topic: {
          type: 'choice',
          choice: 'a',
          probabilities: { a: 1 },
          confidence: 1.0,
        },
      },
    },
  };
  const result = await model.doDecide(options);
  expect(result.usage).toEqual({
    inputTokens: undefined,
    outputTokens: undefined,
  });
  expect(result.response?.modelId).toBe('pplx-decider-v1-27b');
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
    createPerplexity({ apiKey: 'test', fetch: fetchMock })
      .decisionModel('pplx-decider-v1-27b')
      .doDecide({ ...options, abortSignal: controller.signal }),
  ).rejects.toBeDefined();
  expect(fetchMock).toHaveBeenCalledTimes(1);
});

it('serializes and restores a model for workflow boundaries', async () => {
  const original = new PerplexityDecisionModel('pplx-decider-v1-27b', {
    provider: 'perplexity.decision',
    baseURL: 'https://api.perplexity.ai',
    headers: () => ({ Authorization: 'Bearer restored-key' }),
    fetch: vi.fn(),
  });
  const serialized = PerplexityDecisionModel[WORKFLOW_SERIALIZE](original);
  expect(serialized.config.fetch).toBeUndefined();
  const restored = PerplexityDecisionModel[WORKFLOW_DESERIALIZE](
    serialized as unknown as Parameters<
      (typeof PerplexityDecisionModel)[typeof WORKFLOW_DESERIALIZE]
    >[0],
  );
  await restored.doDecide(options);
  expect(server.calls[0].requestHeaders.authorization).toBe(
    'Bearer restored-key',
  );
  expect(restored.supportedQuestionTypes).toEqual([]);
});
