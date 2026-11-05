import { createPerplexity } from '@ai-sdk/perplexity';
import type { JSONObject } from '@ai-sdk/provider';
import { createTestServer } from '@ai-sdk/test-server/with-vitest';
import { describe, expect, it } from 'vitest';
import { generateText } from './generate-text';
import { streamText } from './stream-text';

const AGENT_URL = 'https://api.perplexity.ai/v1/agent';
const server = createTestServer({ [AGENT_URL]: {} });
const perplexity = createPerplexity({ apiKey: 'test-api-key' });

const nativeTools: JSONObject[] = [
  {
    type: 'mcp',
    server_label: 'test',
    server_url: 'https://example.invalid/mcp',
    authorization: 'dummy-mcp-secret',
    headers: { 'x-api-key': 'dummy-mcp-secret' },
  },
  { type: 'connector', id: 'test-connector', server_label: 'connector' },
];

const response = {
  id: 'response-test',
  object: 'response',
  status: 'completed',
  created_at: 0,
  model: 'openai/gpt-5.1',
  output: [
    {
      type: 'message',
      content: [{ type: 'output_text', text: 'Hello.' }],
    },
  ],
  usage: { input_tokens: 1, output_tokens: 1, total_tokens: 2 },
};

describe.each(['generateText', 'streamText'] as const)(
  '%s with Perplexity',
  api => {
    describe.each([
      { label: 'omitted SDK tools', tools: undefined },
      { label: 'empty SDK tools', tools: {} },
    ])('$label', ({ tools }) => {
      it.each(['low', 'openai/gpt-5.1'])(
        'disables native tools and credentials with toolChoice none for %s',
        async modelId => {
          await run({ api, modelId, tools, toolChoice: 'none', nativeTools });

          const body = await server.calls[0].requestBodyJson;
          expect(body).not.toHaveProperty('tools');
          expect(body.max_tool_calls).toBe(0);
          expect(JSON.stringify(body)).not.toContain('dummy-mcp-secret');
        },
      );

      it('disables preset tools without explicit native tools', async () => {
        await run({ api, modelId: 'low', tools, toolChoice: 'none' });

        const body = await server.calls[0].requestBodyJson;
        expect(body).not.toHaveProperty('tools');
        expect(body.max_tool_calls).toBe(0);
      });

      it('preserves native tools with the default tool choice', async () => {
        await run({ api, modelId: 'low', tools, nativeTools });

        const body = await server.calls[0].requestBodyJson;
        expect(body.tools).toEqual(nativeTools);
        expect(body.max_tool_calls).toBe(5);
      });
    });
  },
);

async function run({
  api,
  modelId,
  tools,
  toolChoice,
  nativeTools,
}: {
  api: 'generateText' | 'streamText';
  modelId: string;
  tools: {} | undefined;
  toolChoice?: 'none';
  nativeTools?: JSONObject[];
}) {
  server.urls[AGENT_URL].response =
    api === 'generateText'
      ? { type: 'json-value', body: response }
      : {
          type: 'stream-chunks',
          chunks: [
            `data: ${JSON.stringify({ type: 'response.completed', response })}\n\n`,
            'data: [DONE]\n\n',
          ],
        };

  const options = {
    model: perplexity(modelId),
    prompt: 'Say hello.',
    tools,
    toolChoice,
    providerOptions: {
      perplexity: {
        ...(nativeTools == null ? {} : { tools: nativeTools }),
        max_tool_calls: 5,
      },
    },
  };

  const result =
    api === 'generateText' ? await generateText(options) : streamText(options);
  expect(await result.text).toBe('Hello.');
  expect(await result.warnings).toEqual([]);
  expect(server.calls).toHaveLength(1);
}
