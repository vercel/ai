import type { LanguageModelV3Prompt } from '@ai-sdk/provider';
import fs from 'node:fs';
import { expect, it } from 'vitest';
import { createGroq } from './groq-provider';

const prompt: LanguageModelV3Prompt = [
  { role: 'user', content: [{ type: 'text', text: 'Resolve tomorrow.' }] },
];

it('supports structured output with function tools on openai/gpt-oss-120b', async () => {
  const liveError = JSON.parse(
    fs.readFileSync(
      'src/__fixtures__/issue-10023-output-with-tools-error.json',
      'utf8',
    ),
  );

  const groq = createGroq({
    apiKey: 'test-api-key',
    fetch: async (_input, init) => {
      const body =
        typeof init?.body === 'string' ? JSON.parse(init.body) : undefined;

      if (body?.response_format != null && body?.tools != null) {
        return Response.json(liveError, { status: 400 });
      }

      return Response.json({
        id: 'completion-id',
        object: 'chat.completion',
        created: 0,
        model: 'openai/gpt-oss-120b',
        choices: [
          {
            index: 0,
            message: {
              role: 'assistant',
              content: '{"date":"2026-09-04"}',
            },
            finish_reason: 'stop',
          },
        ],
        usage: {
          prompt_tokens: 1,
          completion_tokens: 1,
          total_tokens: 2,
        },
      });
    },
  });

  const result = await groq('openai/gpt-oss-120b').doGenerate({
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
