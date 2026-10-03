import type { LanguageModelV3Prompt } from '@ai-sdk/provider';
import fs from 'node:fs';
import { expect, it } from 'vitest';
import { createGoogleGenerativeAI } from './google-provider';

const prompt: LanguageModelV3Prompt = [
  { role: 'user', content: [{ type: 'text', text: 'Resolve tomorrow.' }] },
];

it('supports structured output with function tools on gemini-2.5-flash-lite', async () => {
  const liveError = JSON.parse(
    fs.readFileSync(
      'src/__fixtures__/issue-10023-output-with-tools-error.json',
      'utf8',
    ),
  );

  const google = createGoogleGenerativeAI({
    apiKey: 'test-api-key',
    fetch: async (_input, init) => {
      const body =
        typeof init?.body === 'string' ? JSON.parse(init.body) : undefined;

      if (
        body?.generationConfig?.responseMimeType === 'application/json' &&
        body?.tools != null
      ) {
        return Response.json(liveError, { status: 400 });
      }

      return Response.json({
        candidates: [
          {
            content: {
              role: 'model',
              parts: [{ text: '{"date":"2026-09-04"}' }],
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

  const result = await google('gemini-2.5-flash-lite').doGenerate({
    prompt,
    responseFormat: {
      type: 'json',
      schema: {
        type: 'object',
        properties: { date: { type: 'string' } },
        required: ['date'],
        additionalProperties: false,
      },
    },
    tools: [
      {
        type: 'function',
        name: 'resolveDate',
        description: 'Resolve a relative date.',
        inputSchema: {
          type: 'object',
          properties: { expression: { type: 'string' } },
          required: ['expression'],
          additionalProperties: false,
        },
      },
    ],
  });

  expect(result.content).toContainEqual({
    type: 'text',
    text: '{"date":"2026-09-04"}',
  });
});
