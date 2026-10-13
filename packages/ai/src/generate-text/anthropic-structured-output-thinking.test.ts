import { createAnthropic } from '@ai-sdk/anthropic';
import { createTestServer } from '@ai-sdk/test-server/with-vitest';
import { describe, expect, it } from 'vitest';
import { z } from 'zod/v4';
import * as Output from './output';
import { generateText } from './generate-text';
import { streamText } from './stream-text';

const url = 'https://api.anthropic.com/v1/messages';
const schema = z.object({
  elements: z.array(
    z.object({
      location: z.string(),
      temperature: z.number(),
      condition: z.string(),
    }),
  ),
});
const output = {
  elements: [
    { location: 'San Francisco', temperature: 58, condition: 'sunny' },
  ],
};

const provider = createAnthropic({ apiKey: 'test-api-key' });

describe('Anthropic structured output with thinking', () => {
  const server = createTestServer({ [url]: {} });

  it('parses JSON tool output through generateText', async () => {
    server.urls[url].response = {
      type: 'json-value',
      body: {
        model: 'claude-sonnet-4-20250514',
        id: 'msg_generate',
        type: 'message',
        role: 'assistant',
        content: [
          {
            type: 'tool_use',
            id: 'toolu_generate',
            name: 'json',
            input: output,
          },
        ],
        stop_reason: 'tool_use',
        usage: { input_tokens: 1, output_tokens: 1 },
      },
    };

    const result = await generateText({
      model: provider('claude-sonnet-4-20250514'),
      prompt: 'Give me the weather.',
      output: Output.object({ schema }),
      providerOptions: {
        anthropic: {
          thinking: { type: 'enabled', budgetTokens: 2000 },
        },
      },
    });

    expect(result.output).toEqual(output);
    expect((await server.calls[0].requestBodyJson).tool_choice).toEqual({
      type: 'auto',
      disable_parallel_tool_use: true,
    });
  });

  it('parses streamed JSON tool output without the model preamble', async () => {
    const events = [
      {
        type: 'message_start',
        message: {
          model: 'claude-sonnet-4-20250514',
          id: 'msg_stream',
          type: 'message',
          role: 'assistant',
          content: [],
          stop_reason: null,
          stop_sequence: null,
          usage: { input_tokens: 1, output_tokens: 0 },
        },
      },
      {
        type: 'content_block_start',
        index: 0,
        content_block: { type: 'text', text: '' },
      },
      {
        type: 'content_block_delta',
        index: 0,
        delta: { type: 'text_delta', text: "I'll invoke the JSON tool." },
      },
      { type: 'content_block_stop', index: 0 },
      {
        type: 'content_block_start',
        index: 1,
        content_block: {
          type: 'tool_use',
          id: 'toolu_stream',
          name: 'json',
          input: {},
        },
      },
      {
        type: 'content_block_delta',
        index: 1,
        delta: {
          type: 'input_json_delta',
          partial_json: JSON.stringify(output).slice(0, -1),
        },
      },
      {
        type: 'content_block_delta',
        index: 1,
        delta: { type: 'input_json_delta', partial_json: '}' },
      },
      { type: 'content_block_stop', index: 1 },
      {
        type: 'message_delta',
        delta: { stop_reason: 'tool_use', stop_sequence: null },
        usage: { input_tokens: 1, output_tokens: 1 },
      },
      { type: 'message_stop' },
    ];
    server.urls[url].response = {
      type: 'stream-chunks',
      chunks: events.map(event => `data: ${JSON.stringify(event)}\n\n`),
    };

    const result = streamText({
      model: provider('claude-sonnet-4-20250514'),
      prompt: 'Give me the weather.',
      output: Output.object({ schema }),
      providerOptions: {
        anthropic: {
          thinking: { type: 'enabled', budgetTokens: 2000 },
        },
      },
    });

    await result.consumeStream();

    expect(await result.output).toEqual(output);
    expect(await result.text).toBe(JSON.stringify(output));
  });
});
