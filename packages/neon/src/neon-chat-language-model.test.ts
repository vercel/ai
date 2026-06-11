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

// Models that route to the unified MLflow endpoint (i.e. not Anthropic/Google/
// OpenAI, which route to their native model classes). `qwen` is permissive;
// `llama` (Meta) has parameter restrictions used by the capability tests.
const MLFLOW_MODEL = 'databricks-qwen35-122b-a10b';
const META_MODEL = 'databricks-llama-4-maverick';

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

function warningFeatures(warnings: ReadonlyArray<Record<string, unknown>>) {
  return warnings.map(w =>
    typeof w.feature === 'string' ? w.feature : String(w.type),
  );
}

describe('NeonChatLanguageModel (MLflow fallback)', () => {
  describe('doGenerate', () => {
    it('maps a unified chat completion response into content/usage/finishReason', async () => {
      const fetch = createJsonFixtureFetchMock('neon-chat-completion');
      const model = createProvider(fetch).chat(MLFLOW_MODEL);

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
      const model = createProvider(fetch).chat(MLFLOW_MODEL);

      await model.doGenerate({ prompt: TEST_PROMPT });

      const [url, init] = fetch.mock.calls[0];
      expect(url).toBe(`${BASE_URL}/ai-gateway/mlflow/v1/chat/completions`);

      const body = JSON.parse(init.body as string);
      expect(body.model).toBe(MLFLOW_MODEL);
      expect(body.messages).toEqual([{ role: 'user', content: 'Hello' }]);

      const headers = init.headers as Record<string, string>;
      const authorization =
        headers['authorization'] ?? headers['Authorization'];
      expect(authorization).toBe('Bearer test-token');
    });
  });

  describe('request transforms', () => {
    it('strips the $schema marker from tool parameters', async () => {
      const fetch = createJsonFixtureFetchMock('neon-chat-completion');
      const model = createProvider(fetch).chat(MLFLOW_MODEL);

      await model.doGenerate({
        prompt: TEST_PROMPT,
        tools: [
          {
            type: 'function',
            name: 'weather',
            description: 'Get the weather',
            inputSchema: {
              $schema: 'http://json-schema.org/draft-07/schema#',
              type: 'object',
              properties: { location: { type: 'string' } },
              required: ['location'],
            },
          },
        ],
      });

      const body = JSON.parse(fetch.mock.calls[0][1].body as string);
      expect(body.tools[0].function.parameters.$schema).toBeUndefined();
      expect(body.tools[0].function.parameters.type).toBe('object');
    });

    it('uses json_schema structured outputs and strips $schema from the schema', async () => {
      const fetch = createJsonFixtureFetchMock('neon-chat-completion');
      const model = createProvider(fetch).chat(MLFLOW_MODEL);

      await model.doGenerate({
        prompt: TEST_PROMPT,
        responseFormat: {
          type: 'json',
          name: 'person',
          schema: {
            $schema: 'http://json-schema.org/draft-07/schema#',
            type: 'object',
            properties: { name: { type: 'string' } },
            required: ['name'],
            additionalProperties: false,
          },
        },
      });

      const body = JSON.parse(fetch.mock.calls[0][1].body as string);
      expect(body.response_format.type).toBe('json_schema');
      expect(body.response_format.json_schema.name).toBe('person');
      expect(body.response_format.json_schema.schema.$schema).toBeUndefined();
    });
  });

  describe('capability handling', () => {
    it('drops penalties and seed for Meta (Llama) models and warns', async () => {
      const fetch = createJsonFixtureFetchMock('neon-chat-completion');
      const model = createProvider(fetch).chat(META_MODEL);

      const result = await model.doGenerate({
        prompt: TEST_PROMPT,
        frequencyPenalty: 0.5,
        presencePenalty: 0.5,
        seed: 7,
      });

      const body = JSON.parse(fetch.mock.calls[0][1].body as string);
      expect(body.frequency_penalty).toBeUndefined();
      expect(body.presence_penalty).toBeUndefined();
      expect(body.seed).toBeUndefined();

      const features = warningFeatures(result.warnings);
      expect(features).toContain('frequencyPenalty');
      expect(features).toContain('presencePenalty');
      expect(features).toContain('seed');
    });

    it('passes parameters through unchanged for unknown/permissive models', async () => {
      const fetch = createJsonFixtureFetchMock('neon-chat-completion');
      const model = createProvider(fetch).chat(MLFLOW_MODEL);

      const result = await model.doGenerate({
        prompt: TEST_PROMPT,
        frequencyPenalty: 0.5,
        seed: 7,
        temperature: 0.5,
        topP: 0.5,
      });

      const body = JSON.parse(fetch.mock.calls[0][1].body as string);
      expect(body.frequency_penalty).toBe(0.5);
      expect(body.seed).toBe(7);
      expect(body.temperature).toBe(0.5);
      expect(body.top_p).toBe(0.5);

      const features = warningFeatures(result.warnings);
      expect(features).not.toContain('frequencyPenalty');
      expect(features).not.toContain('seed');
    });

    it('merges capability warnings into the stream-start part', async () => {
      const fetch = createStreamFixtureFetchMock('neon-chat-completion');
      const model = createProvider(fetch).chat(META_MODEL);

      const { stream } = await model.doStream({
        prompt: TEST_PROMPT,
        seed: 7,
      });
      const parts = await convertStreamToArray(stream);

      const startPart = parts.find(p => p.type === 'stream-start') as
        | { type: 'stream-start'; warnings: Array<Record<string, unknown>> }
        | undefined;
      expect(startPart).toBeDefined();
      expect(warningFeatures(startPart!.warnings)).toContain('seed');

      const body = JSON.parse(fetch.mock.calls[0][1].body as string);
      expect(body.seed).toBeUndefined();
    });
  });

  describe('doStream', () => {
    it('streams unified chat completion chunks as text deltas', async () => {
      const fetch = createStreamFixtureFetchMock('neon-chat-completion');
      const model = createProvider(fetch).chat(MLFLOW_MODEL);

      const { stream } = await model.doStream({ prompt: TEST_PROMPT });
      const parts = await convertStreamToArray(stream);

      const text = parts
        .filter(part => part.type === 'text-delta')
        .map(part => (part as { delta: string }).delta)
        .join('');

      expect(text).toBe('1\n2\n3\n4\n5');
      expect(parts.at(-1)).toMatchObject({ type: 'finish' });
    });

    it('streams without sending stream_options', async () => {
      const fetch = createStreamFixtureFetchMock('neon-chat-completion');
      const model = createProvider(fetch).chat(MLFLOW_MODEL);

      await model.doStream({ prompt: TEST_PROMPT });

      const body = JSON.parse(fetch.mock.calls[0][1].body as string);
      expect(body.stream).toBe(true);
      expect(body.stream_options).toBeUndefined();
    });
  });
});
