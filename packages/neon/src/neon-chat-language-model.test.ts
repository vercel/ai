import type {
  LanguageModelV4Prompt,
  LanguageModelV4StreamPart,
} from '@ai-sdk/provider';
import fs from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { createNeon } from './neon-provider';

const TEST_PROMPT: LanguageModelV4Prompt = [
  { role: 'user', content: [{ type: 'text', text: 'Hello' }] },
];

const BASE_URL = 'https://br-test-api.ai.c-1.us-east-2.aws.neon.build';

function createProvider(fetch: typeof globalThis.fetch) {
  return createNeon({ apiKey: 'test-token', baseURL: BASE_URL, fetch });
}

async function convertStreamToArray(
  stream: ReadableStream<LanguageModelV4StreamPart>,
) {
  const reader = stream.getReader();
  const chunks: LanguageModelV4StreamPart[] = [];

  while (true) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }
    chunks.push(value);
  }

  return chunks;
}

function createJsonFixtureFetchMock(filename: string) {
  return vi.fn().mockResolvedValue(
    new Response(fs.readFileSync(`src/fixtures/${filename}.json`, 'utf8'), {
      headers: { 'content-type': 'application/json' },
    }),
  );
}

function createStreamFixtureFetchMock(filename: string) {
  const chunks = fs
    .readFileSync(`src/fixtures/${filename}.chunks.txt`, 'utf8')
    .split('\n')
    .filter(line => line.trim().length > 0);

  return vi.fn().mockResolvedValue(
    new Response(
      [...chunks.map(chunk => `data: ${chunk}\n\n`), 'data: [DONE]\n\n'].join(
        '',
      ),
      {
        headers: { 'content-type': 'text/event-stream' },
      },
    ),
  );
}

describe('NeonChatLanguageModel', () => {
  describe('doGenerate', () => {
    it('maps a unified chat completion response into content/usage/finishReason', async () => {
      const fetch = createJsonFixtureFetchMock('neon-chat-completion');
      const model = createProvider(fetch).chat('databricks-claude-haiku-4-5');

      const result = await model.doGenerate({ prompt: TEST_PROMPT });

      expect(result.content).toMatchInlineSnapshot(`
        [
          {
            "text": "Hello, world today.",
            "type": "text",
          },
        ]
      `);
      expect(result.finishReason).toMatchInlineSnapshot(`
        {
          "raw": "stop",
          "unified": "stop",
        }
      `);
      expect(result.usage).toMatchInlineSnapshot(`
        {
          "inputTokens": {
            "cacheRead": 0,
            "cacheWrite": undefined,
            "noCache": 16,
            "total": 16,
          },
          "outputTokens": {
            "reasoning": 0,
            "text": 8,
            "total": 8,
          },
          "raw": {
            "cache_creation_input_tokens": 0,
            "cache_read_input_tokens": 0,
            "completion_tokens": 8,
            "prompt_tokens": 16,
            "total_tokens": 24,
          },
        }
      `);
    });

    it('sends the request to the unified mlflow chat/completions endpoint', async () => {
      const fetch = createJsonFixtureFetchMock('neon-chat-completion');
      const model = createProvider(fetch).chat('databricks-claude-haiku-4-5');

      await model.doGenerate({ prompt: TEST_PROMPT });

      const [url, init] = fetch.mock.calls[0];
      expect(url).toBe(`${BASE_URL}/ai-gateway/mlflow/v1/chat/completions`);

      const body = JSON.parse(init.body as string);
      expect(body.model).toBe('databricks-claude-haiku-4-5');
      expect(body.messages).toEqual([{ role: 'user', content: 'Hello' }]);

      const headers = init.headers as Record<string, string>;
      const authorization =
        headers['authorization'] ?? headers['Authorization'];
      expect(authorization).toBe('Bearer test-token');
    });
  });

  describe('doStream', () => {
    it('streams unified chat completion chunks as text deltas', async () => {
      const fetch = createStreamFixtureFetchMock('neon-chat-completion');
      const model = createProvider(fetch).chat('databricks-claude-haiku-4-5');

      const { stream } = await model.doStream({ prompt: TEST_PROMPT });
      const parts = await convertStreamToArray(stream);

      const text = parts
        .filter(part => part.type === 'text-delta')
        .map(part => (part as { delta: string }).delta)
        .join('');

      expect(text).toBe('1\n2\n3\n4\n5');
      expect(parts.at(-1)).toMatchObject({ type: 'finish' });
    });

    it('streams without sending stream_options (gateway returns usage natively and provider-native backends reject it)', async () => {
      const fetch = createStreamFixtureFetchMock('neon-chat-completion');
      const model = createProvider(fetch).chat('databricks-claude-haiku-4-5');

      await model.doStream({ prompt: TEST_PROMPT });

      const body = JSON.parse(fetch.mock.calls[0][1].body as string);
      expect(body.stream).toBe(true);
      expect(body.stream_options).toBeUndefined();
    });
  });
});
