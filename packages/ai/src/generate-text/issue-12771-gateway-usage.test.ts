import { createGateway } from '@ai-sdk/gateway';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { generateText } from './generate-text';

const gatewayResponse = readFileSync(
  new URL('./__fixtures__/issue-12771-gateway-response.json', import.meta.url),
  'utf8',
);

describe('issue #12771: Gateway usage', () => {
  it('returns numeric usage fields from generateText', async () => {
    let specificationVersion: string | null = null;

    const gateway = createGateway({
      apiKey: 'test-api-key',
      baseURL: 'https://ai-gateway.vercel.sh/v1/ai',
      fetch: async (_input, init) => {
        specificationVersion =
          new Headers(init?.headers).get(
            'ai-language-model-specification-version',
          ) ?? null;

        return new Response(gatewayResponse, {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      },
    });

    const result = await generateText({
      model: gateway('openai/gpt-4o-mini'),
      prompt: 'Say hi',
    });

    expect(specificationVersion).toBe('4');
    expect(result.usage).toMatchObject({
      inputTokens: 9,
      outputTokens: 11,
      totalTokens: 20,
    });
  });
});
