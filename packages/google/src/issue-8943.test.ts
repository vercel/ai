import fs from 'node:fs';
import { describe, expect, it } from 'vitest';
import { createGoogle } from './google-provider';

type ModelId = 'gemini-2.5-flash' | 'gemini-2.5-flash-lite' | 'gemini-2.5-pro';
type Penalty = 'frequencyPenalty' | 'presencePenalty';

const TEST_PROMPT = [
  {
    role: 'user' as const,
    content: [{ type: 'text' as const, text: 'Hello' }],
  },
];

const SUCCESS_RESPONSE = {
  candidates: [
    {
      content: {
        role: 'model',
        parts: [{ text: 'OK' }],
      },
      finishReason: 'STOP',
    },
  ],
  usageMetadata: {
    promptTokenCount: 1,
    candidatesTokenCount: 1,
    totalTokenCount: 2,
  },
};

describe('issue #8943', () => {
  it.each([
    ['frequencyPenalty', 'gemini-2.5-flash'],
    ['presencePenalty', 'gemini-2.5-flash'],
    ['frequencyPenalty', 'gemini-2.5-flash-lite'],
    ['presencePenalty', 'gemini-2.5-flash-lite'],
    ['frequencyPenalty', 'gemini-2.5-pro'],
    ['presencePenalty', 'gemini-2.5-pro'],
  ] as const)(
    'strips %s for %s and returns an unsupported warning',
    async (penalty: Penalty, modelId: ModelId) => {
      const errorFixture = JSON.parse(
        fs.readFileSync(
          `src/__fixtures__/issue-8943-${modelId}-error.json`,
          'utf8',
        ),
      );
      let requestBody:
        | {
            generationConfig?: Record<string, unknown>;
          }
        | undefined;

      const google = createGoogle({
        apiKey: 'test-api-key',
        fetch: async (_input, init) => {
          const parsedRequestBody = JSON.parse(String(init?.body)) as {
            generationConfig?: Record<string, unknown>;
          };
          requestBody = parsedRequestBody;
          const generationConfig = parsedRequestBody.generationConfig ?? {};

          if (
            generationConfig.frequencyPenalty != null ||
            generationConfig.presencePenalty != null
          ) {
            return Response.json(errorFixture, { status: 400 });
          }

          return Response.json(SUCCESS_RESPONSE);
        },
      });

      const result = await google(modelId).doGenerate({
        prompt: TEST_PROMPT,
        [penalty]: 0.5,
      });

      expect(requestBody?.generationConfig).not.toHaveProperty(penalty);
      expect(result.content).toContainEqual({ type: 'text', text: 'OK' });
      expect(result.warnings).toContainEqual({
        type: 'unsupported',
        feature: penalty,
      });
    },
  );

  it('continues forwarding both penalties for Gemini 2.0', async () => {
    let requestBody:
      | {
          generationConfig?: Record<string, unknown>;
        }
      | undefined;

    const google = createGoogle({
      apiKey: 'test-api-key',
      fetch: async (_input, init) => {
        requestBody = JSON.parse(String(init?.body));
        return Response.json(SUCCESS_RESPONSE);
      },
    });

    const result = await google('gemini-2.0-flash').doGenerate({
      prompt: TEST_PROMPT,
      frequencyPenalty: 0.5,
      presencePenalty: 0.5,
    });

    expect(requestBody?.generationConfig).toMatchObject({
      frequencyPenalty: 0.5,
      presencePenalty: 0.5,
    });
    expect(result.warnings).toEqual([]);
  });
});
