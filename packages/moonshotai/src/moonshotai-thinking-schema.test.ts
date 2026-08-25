import type { LanguageModelV4Prompt } from '@ai-sdk/provider';
import fs from 'node:fs';
import { expect, it } from 'vitest';
import { createMoonshotAI } from './moonshotai-provider';

const prompt: LanguageModelV4Prompt = [
  {
    role: 'user',
    content: [{ type: 'text', text: 'Reply with OK.' }],
  },
];

it('does not serialize thinking.type disabled for kimi-k2.7-code', async () => {
  let requestBody: Record<string, any> | undefined;

  const provider = createMoonshotAI({
    apiKey: 'test-api-key',
    fetch: async (_url, init) => {
      requestBody = JSON.parse(String(init?.body));

      return new Response(
        JSON.stringify({
          id: 'chatcmpl-test',
          object: 'chat.completion',
          created: 0,
          model: 'kimi-k2.7-code',
          choices: [
            {
              index: 0,
              message: { role: 'assistant', content: 'OK' },
              finish_reason: 'stop',
            },
          ],
          usage: {
            prompt_tokens: 1,
            completion_tokens: 1,
            total_tokens: 2,
          },
        }),
        {
          status: 200,
          headers: { 'content-type': 'application/json' },
        },
      );
    },
  });

  const result = await provider.chatModel('kimi-k2.7-code').doGenerate({
    prompt,
    providerOptions: {
      moonshotai: { thinking: { type: 'disabled' } },
    },
  });

  expect(requestBody?.thinking?.type).not.toBe('disabled');
  expect(result.warnings.length).toBeGreaterThan(0);
});

it('records the live Moonshot rejection for disabled K2.7 thinking', () => {
  const fixture = JSON.parse(
    fs.readFileSync(
      'src/__fixtures__/moonshotai-k2.7-disabled-thinking-error.json',
      'utf8',
    ),
  );

  expect(fixture).toEqual({
    error: {
      message: 'invalid thinking: only type=enabled is allowed for this model',
      type: 'invalid_request_error',
    },
  });
});
