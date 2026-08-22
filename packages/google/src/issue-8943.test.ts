import fs from 'node:fs';
import type { LanguageModelV2Prompt } from '@ai-sdk/provider';
import { createGoogleGenerativeAI } from './google-provider';
import { describe, expect, it } from 'vitest';

const prompt: LanguageModelV2Prompt = [
  { role: 'user', content: [{ type: 'text', text: 'Reply with OK.' }] },
];

const successResponse = {
  candidates: [
    {
      content: {
        parts: [{ text: 'OK' }],
        role: 'model',
      },
      finishReason: 'STOP',
      index: 0,
    },
  ],
  usageMetadata: {
    promptTokenCount: 4,
    candidatesTokenCount: 1,
    totalTokenCount: 5,
  },
};

const models = [
  'gemini-2.5-flash',
  'gemini-2.5-flash-lite',
  'gemini-2.5-pro',
] as const;

const penalties = [
  {
    setting: 'frequencyPenalty',
    options: { frequencyPenalty: 0.5 },
  },
  {
    setting: 'presencePenalty',
    options: { presencePenalty: 0.5 },
  },
] as const;

function readErrorFixture(model: (typeof models)[number]) {
  return fs.readFileSync(
    `src/__fixtures__/issue-8943-${model}-error.json`,
    'utf8',
  );
}

describe('issue #8943: Gemini 2.5 penalties', () => {
  for (const modelId of models) {
    for (const penalty of penalties) {
      it(`should strip ${penalty.setting} and warn for ${modelId}`, async () => {
        let requestBody: any;
        const provider = createGoogleGenerativeAI({
          apiKey: 'test-api-key',
          fetch: async (_input, init) => {
            requestBody = JSON.parse(init?.body as string);

            const sentUnsupportedPenalty =
              requestBody.generationConfig?.frequencyPenalty != null ||
              requestBody.generationConfig?.presencePenalty != null;

            return sentUnsupportedPenalty
              ? new Response(readErrorFixture(modelId), {
                  status: 400,
                  headers: { 'content-type': 'application/json' },
                })
              : Response.json(successResponse);
          },
        });

        const result = await provider(modelId).doGenerate({
          prompt,
          ...penalty.options,
        });

        expect(requestBody.generationConfig).not.toHaveProperty(
          penalty.setting,
        );
        expect(result.warnings).toContainEqual({
          type: 'unsupported-setting',
          setting: penalty.setting,
        });
      });
    }
  }

  it('should continue forwarding both penalties to Gemini 2.0', async () => {
    let requestBody: any;
    const provider = createGoogleGenerativeAI({
      apiKey: 'test-api-key',
      fetch: async (_input, init) => {
        requestBody = JSON.parse(init?.body as string);
        return Response.json(successResponse);
      },
    });

    const result = await provider('gemini-2.0-flash').doGenerate({
      prompt,
      frequencyPenalty: 0.5,
      presencePenalty: 0.5,
    });

    expect(requestBody.generationConfig).toMatchObject({
      frequencyPenalty: 0.5,
      presencePenalty: 0.5,
    });
    expect(result.warnings).toEqual([]);
  });
});
