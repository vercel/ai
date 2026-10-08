import type { LanguageModelV4Prompt } from '@ai-sdk/provider';
import { mockId } from '@ai-sdk/provider-utils/test';
import { createTestServer } from '@ai-sdk/test-server/with-vitest';
import fs from 'node:fs';
import { describe, expect, it } from 'vitest';
import { OpenAIResponsesLanguageModel } from './openai-responses-language-model';

const TEST_PROMPT: LanguageModelV4Prompt = [
  { role: 'user', content: [{ type: 'text', text: 'Hello' }] },
];

function createModel(modelId: string) {
  return new OpenAIResponsesLanguageModel(modelId, {
    provider: 'openai',
    url: ({ path }) => `https://api.openai.com/v1${path}`,
    headers: () => ({ Authorization: 'Bearer APIKEY' }),
    generateId: mockId(),
  });
}

describe('GPT-6 sampling parameters with disabled reasoning', () => {
  const server = createTestServer({
    'https://api.openai.com/v1/responses': {},
  });

  it.each(['gpt-6-sol', 'gpt-6-luna'])(
    'preserves temperature and topP for %s when reasoning effort is none',
    async modelId => {
      server.urls['https://api.openai.com/v1/responses'].response = {
        type: 'json-value',
        body: JSON.parse(
          fs.readFileSync(
            `src/responses/__fixtures__/${modelId}-reasoning-none-sampling.json`,
            'utf8',
          ),
        ),
      };

      const result = await createModel(modelId).doGenerate({
        prompt: TEST_PROMPT,
        temperature: 0,
        topP: 0.9,
        providerOptions: {
          openai: {
            reasoningEffort: 'none',
            store: false,
          },
        },
      });

      expect(await server.calls[0].requestBodyJson).toMatchObject({
        model: modelId,
        reasoning: { effort: 'none' },
        temperature: 0,
        top_p: 0.9,
      });
      expect(result.warnings).toStrictEqual([]);
    },
  );
});
