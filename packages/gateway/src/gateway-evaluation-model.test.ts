import { describe, it, expect } from 'vitest';
import { createTestServer } from '@ai-sdk/test-server/with-vitest';
import { GatewayEvaluationModel } from './gateway-evaluation-model';
import type { GatewayConfig } from './gateway-config';
import {
  GatewayInvalidRequestError,
  GatewayInternalServerError,
} from './errors';

const testState = 'The capital of France is Paris.';

const testQuestions = {
  correct: {
    type: 'boolean' as const,
    instructions: 'Is the statement factually correct?',
  },
  tone: {
    type: 'choice' as const,
    instructions: 'What is the tone?',
    criteria: { neutral: 'Plain and factual.', playful: null },
  },
  quality: {
    type: 'score' as const,
    instructions: 'Rate the quality.',
    criteria: ['Poor.', 'Acceptable.', 'Excellent.'],
  },
};

const dummyAnswers = {
  correct: { type: 'boolean', probability: 0.97 },
  tone: {
    type: 'choice',
    choice: 'neutral',
    probabilities: { neutral: 0.9, playful: 0.1 },
  },
  quality: {
    type: 'score',
    score: 1.8,
    probabilities: { '0': 0.05, '1': 0.1, '2': 0.85 },
  },
};

const server = createTestServer({
  'https://api.test.com/evaluation-model': {},
});

const createTestModel = (
  config: Partial<
    GatewayConfig & { o11yHeaders?: Record<string, string> }
  > = {},
) =>
  new GatewayEvaluationModel('typesafe-ai/jev-latest', {
    provider: 'gateway',
    baseURL: 'https://api.test.com',
    headers: () => ({
      Authorization: 'Bearer test-token',
      'ai-gateway-auth-method': 'api-key',
    }),
    fetch: globalThis.fetch,
    o11yHeaders: config.o11yHeaders || {},
    ...config,
  });

describe('GatewayEvaluationModel', () => {
  function prepareJsonResponse({
    answers = dummyAnswers,
    model,
    rounding,
    usage,
    warnings,
    headers,
  }: {
    answers?: Record<string, unknown>;
    model?: string;
    rounding?: { probabilityDecimals?: number; scoreDecimals?: number };
    usage?: { inputTokens?: number; outputTokens?: number };
    warnings?: Array<
      | { type: 'unsupported'; feature: string; details?: string }
      | { type: 'compatibility'; feature: string; details?: string }
      | { type: 'deprecated'; setting: string; message: string }
      | { type: 'other'; message: string }
    >;
    headers?: Record<string, string>;
  } = {}) {
    server.urls['https://api.test.com/evaluation-model'].response = {
      type: 'json-value',
      headers,
      body: {
        answers,
        ...(model && { model }),
        ...(rounding && { rounding }),
        ...(usage && { usage }),
        ...(warnings && { warnings }),
      },
    };
  }

  it('should report all question types as supported', () => {
    expect(createTestModel().supportedQuestionTypes).toStrictEqual([
      'choice',
      'score',
      'boolean',
    ]);
  });

  describe('doEvaluate', () => {
    it('should pass headers correctly', async () => {
      prepareJsonResponse();

      await createTestModel().doEvaluate({
        state: testState,
        questions: testQuestions,
        headers: { 'Custom-Header': 'test-value' },
      });

      const headers = server.calls[0].requestHeaders;
      expect(headers).toMatchObject({
        authorization: 'Bearer test-token',
        'custom-header': 'test-value',
        'ai-evaluation-model-specification-version': '4',
        'ai-model-id': 'typesafe-ai/jev-latest',
      });
    });

    it('should include o11y headers', async () => {
      prepareJsonResponse();

      const o11yHeaders = {
        'ai-o11y-deployment-id': 'deployment-1',
        'ai-o11y-environment': 'production',
        'ai-o11y-region': 'iad1',
      } as const;

      await createTestModel({ o11yHeaders }).doEvaluate({
        state: testState,
        questions: testQuestions,
      });

      const headers = server.calls[0].requestHeaders;
      expect(headers).toMatchObject(o11yHeaders);
    });

    it('should send state and questions in request body', async () => {
      prepareJsonResponse();

      await createTestModel().doEvaluate({
        state: testState,
        questions: testQuestions,
      });

      expect(await server.calls[0].requestBodyJson).toStrictEqual({
        state: testState,
        questions: testQuestions,
      });
    });

    it('should pass providerOptions into request body', async () => {
      prepareJsonResponse();

      await createTestModel().doEvaluate({
        state: testState,
        questions: testQuestions,
        providerOptions: { typesafe: { effort: 'high' } },
      });

      const body = await server.calls[0].requestBodyJson;
      expect(body).toMatchObject({
        providerOptions: { typesafe: { effort: 'high' } },
      });
    });

    it('should pass conditional model fallbacks into request body', async () => {
      prepareJsonResponse();

      const providerOptions = {
        gateway: {
          models: [
            {
              model: 'openai/gpt-5.6-sol',
              when: {
                any: [
                  { question: 'tone', confidenceBelow: 0.6 },
                  {
                    question: 'correct',
                    probabilityBetween: [0.4, 0.6],
                  },
                ],
              },
            },
            'anthropic/claude-sonnet-5',
          ],
        },
      } as const;

      await createTestModel().doEvaluate({
        state: testState,
        questions: testQuestions,
        providerOptions,
      });

      expect(await server.calls[0].requestBodyJson).toMatchObject({
        providerOptions,
      });
    });

    it('should pass service-owned gateway options through with conditional fallbacks', async () => {
      prepareJsonResponse();

      const providerOptions = {
        gateway: {
          models: [
            {
              model: 'openai/gpt-5.6-sol',
              when: { question: 'tone', confidenceBelow: 0.6 },
            },
          ],
          order: ['openai'],
          serviceOwnedOption: { nested: ['value', 1, true] },
        },
        typesafe: { effort: 'high' },
      } as const;

      await createTestModel().doEvaluate({
        state: testState,
        questions: testQuestions,
        providerOptions,
      });

      expect(await server.calls[0].requestBodyJson).toStrictEqual({
        state: testState,
        questions: testQuestions,
        providerOptions,
      });
    });

    it('should reject invalid conditional model fallbacks', async () => {
      prepareJsonResponse();

      await expect(
        createTestModel().doEvaluate({
          state: testState,
          questions: testQuestions,
          providerOptions: {
            gateway: {
              models: [
                {
                  model: 'openai/gpt-5.6-sol',
                  when: {
                    question: 'correct',
                    probabilityBetween: [0.7, 0.3],
                  },
                },
              ],
            },
          },
        }),
      ).rejects.toThrow('invalid gateway provider options');
      expect(server.calls).toHaveLength(0);
    });

    it('should extract choice, score, and boolean answers', async () => {
      prepareJsonResponse({ answers: dummyAnswers });

      const { answers } = await createTestModel().doEvaluate({
        state: testState,
        questions: testQuestions,
      });

      expect(answers).toStrictEqual(dummyAnswers);
    });

    it('should extract rounding', async () => {
      prepareJsonResponse({
        rounding: { probabilityDecimals: 2, scoreDecimals: 2 },
      });

      const { rounding } = await createTestModel().doEvaluate({
        state: testState,
        questions: testQuestions,
      });

      expect(rounding).toStrictEqual({
        probabilityDecimals: 2,
        scoreDecimals: 2,
      });
    });

    it('should extract usage', async () => {
      prepareJsonResponse({ usage: { inputTokens: 42, outputTokens: 7 } });

      const { usage } = await createTestModel().doEvaluate({
        state: testState,
        questions: testQuestions,
      });

      expect(usage).toStrictEqual({ inputTokens: 42, outputTokens: 7 });
    });

    it('should omit rounding and usage when absent', async () => {
      prepareJsonResponse();

      const result = await createTestModel().doEvaluate({
        state: testState,
        questions: testQuestions,
      });

      expect(result.rounding).toBeUndefined();
      expect(result.usage).toBeUndefined();
    });

    it('should extract warnings', async () => {
      const mockWarnings = [
        {
          type: 'unsupported' as const,
          feature: 'providerOptions.typesafe.effort',
          details: 'This model ignores effort.',
        },
      ];

      prepareJsonResponse({ warnings: mockWarnings });

      const { warnings } = await createTestModel().doEvaluate({
        state: testState,
        questions: testQuestions,
      });

      expect(warnings).toStrictEqual(mockWarnings);
    });

    it('should default warnings to an empty array when absent', async () => {
      prepareJsonResponse();

      const { warnings } = await createTestModel().doEvaluate({
        state: testState,
        questions: testQuestions,
      });

      expect(warnings).toStrictEqual([]);
    });

    it('should return response metadata', async () => {
      prepareJsonResponse({ headers: { 'x-request-id': 'req-123' } });

      const result = await createTestModel().doEvaluate({
        state: testState,
        questions: testQuestions,
      });

      expect(result.response?.modelId).toBe('typesafe-ai/jev-latest');
      expect(result.response?.headers?.['x-request-id']).toBe('req-123');
    });

    it('should attribute the response to the returned model after a fallback', async () => {
      prepareJsonResponse({ model: 'anthropic/claude-sonnet-5' });

      const result = await createTestModel().doEvaluate({
        state: testState,
        questions: testQuestions,
      });

      expect(result.response?.modelId).toBe('anthropic/claude-sonnet-5');
    });

    it('should attribute the response to the requested model when none is returned', async () => {
      prepareJsonResponse();

      const result = await createTestModel().doEvaluate({
        state: testState,
        questions: testQuestions,
      });

      expect(result.response?.modelId).toBe('typesafe-ai/jev-latest');
    });

    it('should return provider metadata', async () => {
      server.urls['https://api.test.com/evaluation-model'].response = {
        type: 'json-value',
        body: {
          answers: dummyAnswers,
          providerMetadata: {
            gateway: { cost: '0.002' },
          },
        },
      };

      const result = await createTestModel().doEvaluate({
        state: testState,
        questions: testQuestions,
      });

      expect(result.providerMetadata).toStrictEqual({
        gateway: { cost: '0.002' },
      });
    });
  });

  describe('error handling', () => {
    it('should throw GatewayInvalidRequestError on 400', async () => {
      server.urls['https://api.test.com/evaluation-model'].response = {
        type: 'error',
        status: 400,
        body: JSON.stringify({
          error: {
            message: 'Invalid questions format',
            type: 'invalid_request_error',
          },
        }),
      };

      await expect(
        createTestModel().doEvaluate({
          state: testState,
          questions: testQuestions,
        }),
      ).rejects.toSatisfy(
        err =>
          GatewayInvalidRequestError.isInstance(err) && err.statusCode === 400,
      );
    });

    it('should throw GatewayInternalServerError on 500', async () => {
      server.urls['https://api.test.com/evaluation-model'].response = {
        type: 'error',
        status: 500,
        body: JSON.stringify({
          error: {
            message: 'Internal server error',
            type: 'internal_server_error',
          },
        }),
      };

      await expect(
        createTestModel().doEvaluate({
          state: testState,
          questions: testQuestions,
        }),
      ).rejects.toSatisfy(
        err =>
          GatewayInternalServerError.isInstance(err) && err.statusCode === 500,
      );
    });
  });

  describe('URL construction', () => {
    it('should post to /evaluation-model endpoint', async () => {
      prepareJsonResponse();

      await createTestModel().doEvaluate({
        state: testState,
        questions: testQuestions,
      });

      expect(server.calls[0].requestUrl).toBe(
        'https://api.test.com/evaluation-model',
      );
    });
  });
});
