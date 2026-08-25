import type { LanguageModelV4Prompt } from '@ai-sdk/provider';
import fs from 'node:fs';
import { expect, it } from 'vitest';
import { createMoonshotAI } from './moonshotai-provider';

const TEST_PROMPT: LanguageModelV4Prompt = [
  {
    role: 'user',
    content: [{ type: 'text', text: 'Reply with exactly OK' }],
  },
];

const successResponse = JSON.parse(
  fs.readFileSync(
    'src/__fixtures__/moonshotai-kimi-k3-default-sampling.json',
    'utf8',
  ),
);

const temperatureRejection = JSON.parse(
  fs.readFileSync(
    'src/__fixtures__/moonshotai-kimi-k3-temperature-rejection.json',
    'utf8',
  ),
);

it('does not let a generic temperature option break Kimi K3 generation', async () => {
  const provider = createMoonshotAI({
    apiKey: 'test-api-key',
    fetch: async (_url, init) => {
      const requestBody = JSON.parse(String(init?.body));
      const rejected = requestBody.temperature != null;

      return Response.json(rejected ? temperatureRejection : successResponse, {
        status: rejected ? 400 : 200,
      });
    },
  });

  await expect(
    provider.chatModel('kimi-k3').doGenerate({
      prompt: TEST_PROMPT,
      temperature: 0.5,
      maxOutputTokens: 1,
    }),
  ).resolves.toMatchObject({
    content: expect.arrayContaining([{ type: 'text', text: 'OK' }]),
  });
});
