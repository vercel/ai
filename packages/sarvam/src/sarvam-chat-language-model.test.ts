import { LanguageModelV3Prompt } from '@ai-sdk/provider';
import { createTestServer } from '@ai-sdk/test-server/with-vitest';
import fs from 'node:fs';
import { createSarvam } from './sarvam-provider';
import { beforeEach, describe, it, expect, vi } from 'vitest';

vi.mock('@ai-sdk/provider-utils', async () => {
  const actual = await vi.importActual('@ai-sdk/provider-utils');
  return {
    ...actual,
    loadApiKey: vi.fn().mockReturnValue('test-api-key'),
    loadOptionalSetting: vi.fn(),
    withoutTrailingSlash: vi.fn(
      (url: string) => url?.replace(/\/$/, '') ?? url,
    ),
  };
});

vi.mock('./version', () => ({
  VERSION: '0.0.0-test',
}));

const TEST_PROMPT: LanguageModelV3Prompt = [
  { role: 'user', content: [{ type: 'text', text: 'Hello' }] },
];

const CHAT_COMPLETIONS_URL = 'https://api.sarvam.ai/v1/chat/completions';

const provider = createSarvam({ apiKey: 'test-api-key' });
const model = provider('sarvam-m');

const server = createTestServer({
  [CHAT_COMPLETIONS_URL]: {},
});

describe('doGenerate', () => {
  function prepareJsonFixtureResponse(
    filename: string,
    { headers }: { headers?: Record<string, string> } = {},
  ) {
    server.urls[CHAT_COMPLETIONS_URL].response = {
      type: 'json-value',
      headers,
      body: JSON.parse(
        fs.readFileSync(`src/__fixtures__/${filename}.json`, 'utf8'),
      ),
    };
  }

  describe('text', () => {
    beforeEach(() => {
      prepareJsonFixtureResponse('sarvam-text');
    });

    it('should extract text content', async () => {
      const result = await model.doGenerate({
        prompt: TEST_PROMPT,
      });

      expect(result.content).toHaveLength(1);
      expect(result.content[0]).toEqual({
        type: 'text',
        text: expect.stringContaining('Quantum computing'),
      });
    });

    it('should send correct request body with api-subscription-key header', async () => {
      await model.doGenerate({
        prompt: TEST_PROMPT,
      });

      expect(await server.calls[0].requestBodyJson).toMatchObject({
        messages: [{ role: 'user', content: 'Hello' }],
        model: 'sarvam-m',
      });

      expect(server.calls[0].requestHeaders['api-subscription-key']).toBe(
        'test-api-key',
      );
    });
  });
});
