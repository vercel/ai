import type { LanguageModelV4CallOptions } from '@ai-sdk/provider';
import fs from 'node:fs';
import { describe, expect, it } from 'vitest';
import { createMistral } from './mistral-provider';

const prompt: LanguageModelV4CallOptions['prompt'] = [
  {
    role: 'user',
    content: [
      {
        type: 'text',
        text: 'How many r are in "strawberry"? Be brief.',
      },
    ],
  },
];

const reasoningResponse = JSON.parse(
  fs.readFileSync(
    'src/__fixtures__/mistral-large-4-reasoning-high.json',
    'utf8',
  ),
);
const noReasoningResponse = JSON.parse(
  fs.readFileSync(
    'src/__fixtures__/mistral-large-4-without-reasoning-effort.json',
    'utf8',
  ),
);

describe('Mistral Large 4 configurable reasoning', () => {
  it.each([
    {
      modelId: 'mistral-large-4',
      callOptions: {
        providerOptions: { mistral: { reasoningEffort: 'high' } },
      },
    },
    {
      modelId: 'mistral-large-4-0',
      callOptions: {
        providerOptions: { mistral: { reasoningEffort: 'high' } },
      },
    },
    {
      modelId: 'mistral-large-4',
      callOptions: { reasoning: 'high' },
    },
    {
      modelId: 'mistral-large-4-0',
      callOptions: { reasoning: 'high' },
    },
  ] as const)(
    'returns reasoning for $modelId with $callOptions',
    async ({ modelId, callOptions }) => {
      let requestBody: Record<string, unknown> | undefined;
      const provider = createMistral({
        apiKey: 'test-api-key',
        fetch: async (_input, init) => {
          requestBody = JSON.parse(String(init?.body)) as Record<
            string,
            unknown
          >;

          return Response.json(
            requestBody.reasoning_effort === 'high'
              ? reasoningResponse
              : noReasoningResponse,
          );
        },
      });

      const result = await provider.chat(modelId).doGenerate({
        prompt,
        ...callOptions,
      });

      expect(result.content).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            type: 'reasoning',
            text: expect.stringMatching(/\S/),
          }),
        ]),
      );
      expect(requestBody).toMatchObject({ reasoning_effort: 'high' });
      expect(result.warnings).not.toContainEqual(
        expect.objectContaining({
          type: 'unsupported',
          feature: 'reasoning',
        }),
      );
    },
  );
});
