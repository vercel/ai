import type { LanguageModelV4Prompt } from '@ai-sdk/provider';
import fs from 'node:fs';
import { describe, expect, it } from 'vitest';
import { createGroq } from './groq-provider';

const TEST_PROMPT: LanguageModelV4Prompt = [
  {
    role: 'user',
    content: [
      {
        type: 'text',
        text: 'What is 17 times 19? Explain your calculation, then answer.',
      },
    ],
  },
];

const reasoningEnabledResponse = JSON.parse(
  fs.readFileSync('src/__fixtures__/groq-qwen-reasoning-enabled.json', 'utf8'),
);

const reasoningDisabledResponse = JSON.parse(
  fs.readFileSync('src/__fixtures__/groq-qwen-reasoning-disabled.json', 'utf8'),
);

describe('issue #19357', () => {
  it("disables Qwen reasoning for top-level reasoning 'none'", async () => {
    const model = createGroq({
      apiKey: 'test-api-key',
      fetch: async (_url, init) => {
        const requestBody = JSON.parse(String(init?.body));

        return Response.json(
          requestBody.reasoning_effort === 'none'
            ? reasoningDisabledResponse
            : reasoningEnabledResponse,
        );
      },
    })('qwen/qwen3.6-27b');

    const result = await model.doGenerate({
      prompt: TEST_PROMPT,
      reasoning: 'none',
      providerOptions: {
        groq: {
          reasoningFormat: 'parsed',
        },
      },
    });

    expect(result.content.some(part => part.type === 'reasoning')).toBe(false);
  });
});
