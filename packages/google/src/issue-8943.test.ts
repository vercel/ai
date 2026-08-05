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

describe('issue #8943', () => {
  it.each([
    ['gemini-2.5-flash', 'frequencyPenalty'],
    ['gemini-2.5-flash', 'presencePenalty'],
    ['gemini-2.5-flash-lite', 'frequencyPenalty'],
    ['gemini-2.5-flash-lite', 'presencePenalty'],
    ['gemini-2.5-pro', 'frequencyPenalty'],
    ['gemini-2.5-pro', 'presencePenalty'],
  ] as const)(
    'strips %s %s and returns an unsupported warning',
    async (modelId: ModelId, penalty: Penalty) => {
      const errorFixture = JSON.parse(
        fs.readFileSync(
          `src/__fixtures__/issue-8943-${modelId}-error.json`,
          'utf8',
        ),
      );

      const google = createGoogle({
        apiKey: 'test-api-key',
        fetch: async (_input, init) => {
          const requestBody = JSON.parse(String(init?.body));
          const generationConfig = requestBody.generationConfig ?? {};

          if (
            generationConfig.frequencyPenalty != null ||
            generationConfig.presencePenalty != null
          ) {
            return Response.json(errorFixture, { status: 400 });
          }

          return Response.json({
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
          });
        },
      });

      const result = await google(modelId).doGenerate({
        prompt: TEST_PROMPT,
        [penalty]: 0.5,
      });

      expect(result.content).toContainEqual({ type: 'text', text: 'OK' });
      expect(result.warnings).toContainEqual({
        type: 'unsupported',
        feature: penalty,
      });
    },
  );
});
