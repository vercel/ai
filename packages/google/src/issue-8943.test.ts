import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { LanguageModelV3Prompt } from '@ai-sdk/provider';
import { createGoogleGenerativeAI } from './google-provider';

const models = [
  'gemini-2.5-flash',
  'gemini-2.5-flash-lite',
  'gemini-2.5-pro',
] as const;

const penalties = ['frequencyPenalty', 'presencePenalty'] as const;

const prompt: LanguageModelV3Prompt = [
  {
    role: 'user',
    content: [{ type: 'text', text: 'Reply with OK.' }],
  },
];

const successfulResponse = {
  candidates: [
    {
      content: {
        parts: [{ text: 'OK.' }],
        role: 'model',
      },
      finishReason: 'STOP',
      index: 0,
    },
  ],
  usageMetadata: {
    promptTokenCount: 5,
    candidatesTokenCount: 2,
    totalTokenCount: 7,
  },
};

describe('issue #8943: Gemini 2.5 penalties', () => {
  it.each(
    models.flatMap(model =>
      penalties.map(penalty => ({
        model,
        penalty,
      })),
    ),
  )(
    'strips $penalty for $model and returns an unsupported warning',
    async ({ model, penalty }) => {
      let requestBody: Record<string, any> | undefined;

      const google = createGoogleGenerativeAI({
        apiKey: 'test-api-key',
        fetch: async (input, init) => {
          requestBody =
            typeof init?.body === 'string' ? JSON.parse(init.body) : undefined;

          const hasUnsupportedPenalty =
            requestBody?.generationConfig?.frequencyPenalty != null ||
            requestBody?.generationConfig?.presencePenalty != null;

          if (hasUnsupportedPenalty) {
            return new Response(
              readFileSync(
                `src/__fixtures__/issue-8943-${model}-error.json`,
                'utf8',
              ),
              {
                status: 400,
                headers: { 'content-type': 'application/json' },
              },
            );
          }

          return Response.json(successfulResponse);
        },
      });

      const result = await google(model).doGenerate({
        prompt,
        [penalty]: 0.5,
      });

      expect(requestBody?.generationConfig).not.toHaveProperty(penalty);
      expect(result.warnings).toContainEqual({
        type: 'unsupported',
        feature: penalty,
      });
      expect(result.content).toContainEqual({
        type: 'text',
        text: 'OK.',
      });
    },
  );
});
