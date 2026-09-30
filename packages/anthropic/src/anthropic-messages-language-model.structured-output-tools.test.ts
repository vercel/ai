import type { LanguageModelV2Prompt } from '@ai-sdk/provider';
import {
  convertReadableStreamToArray,
  mockId,
} from '@ai-sdk/provider-utils/test';
import { createTestServer } from '@ai-sdk/test-server/with-vitest';
import fs from 'node:fs';
import { expect, it, vi } from 'vitest';
import { createAnthropic } from './anthropic-provider';

vi.mock('./version', () => ({
  VERSION: '0.0.0-test',
}));

const TEST_PROMPT: LanguageModelV2Prompt = [
  { role: 'user', content: [{ type: 'text', text: 'Hello' }] },
];

const model = createAnthropic({
  apiKey: 'test-api-key',
  generateId: mockId({ prefix: 'id' }),
})('claude-3-haiku-20240307');

const server = createTestServer({
  'https://api.anthropic.com/v1/messages': {},
});

const JSON_TOOL = {
  type: 'function' as const,
  name: 'json',
  description: 'Return caller-owned JSON data',
  inputSchema: {
    type: 'object' as const,
    properties: {
      value: { type: 'string' as const },
    },
    required: ['value'],
    additionalProperties: false,
  },
};

const JSON_RESPONSE_FORMAT = {
  type: 'json' as const,
  schema: {
    type: 'object' as const,
    properties: {
      result: { type: 'string' as const },
    },
    required: ['result'],
    additionalProperties: false,
  },
};

it('should stream a non-JSON tool call with a JSON response format', async () => {
  const chunks = fs
    .readFileSync(
      'src/__fixtures__/anthropic-json-other-tool.1.chunks.txt',
      'utf8',
    )
    .split('\n')
    .map(line => `data: ${line}\n\n`);
  chunks.push('data: [DONE]\n\n');

  server.urls['https://api.anthropic.com/v1/messages'].response = {
    type: 'stream-chunks',
    chunks,
  };

  const { stream } = await model.doStream({
    prompt: TEST_PROMPT,
    tools: [
      {
        type: 'function',
        name: 'weather',
        description: 'Get the weather in a location',
        inputSchema: {
          type: 'object',
          properties: {
            location: { type: 'string' },
          },
          required: ['location'],
          additionalProperties: false,
        },
      },
    ],
    responseFormat: {
      type: 'json',
      schema: {
        type: 'object',
        properties: {
          weather: { type: 'string' },
          temperature: { type: 'number' },
        },
        required: ['weather', 'temperature'],
        additionalProperties: false,
      },
    },
  });

  expect(await server.calls[0].requestBodyJson).toMatchObject({
    tool_choice: {
      disable_parallel_tool_use: true,
      type: 'any',
    },
    tools: [
      expect.objectContaining({ name: 'weather' }),
      expect.objectContaining({ name: 'json' }),
    ],
  });

  expect(await convertReadableStreamToArray(stream)).toEqual(
    expect.arrayContaining([
      {
        type: 'tool-call',
        toolCallId: 'toolu_019Zvehfe1XQWweT1pm7okyt',
        toolName: 'weather',
        input: '{"location": "San Francisco"}',
        providerExecuted: undefined,
      },
      expect.objectContaining({
        type: 'finish',
        finishReason: 'tool-calls',
      }),
    ]),
  );
});

it('should generate a caller-defined json tool call with a JSON response format', async () => {
  server.urls['https://api.anthropic.com/v1/messages'].response = {
    type: 'json-value',
    body: {
      id: 'msg_json_tool',
      type: 'message',
      role: 'assistant',
      content: [
        {
          type: 'tool_use',
          id: 'toolu_json',
          name: 'json',
          input: { value: 'caller tool' },
        },
      ],
      model: 'claude-3-haiku-20240307',
      stop_reason: 'tool_use',
      stop_sequence: null,
      usage: {
        input_tokens: 10,
        output_tokens: 5,
      },
    },
  };

  const result = await model.doGenerate({
    prompt: TEST_PROMPT,
    tools: [JSON_TOOL],
    responseFormat: JSON_RESPONSE_FORMAT,
  });

  expect(await server.calls[0].requestBodyJson).toMatchObject({
    tool_choice: {
      disable_parallel_tool_use: true,
      type: 'any',
    },
    tools: [
      expect.objectContaining({ name: 'json' }),
      expect.objectContaining({ name: 'json_1' }),
    ],
  });
  expect(result.content).toEqual([
    {
      type: 'tool-call',
      toolCallId: 'toolu_json',
      toolName: 'json',
      input: '{"value":"caller tool"}',
    },
  ]);
  expect(result.finishReason).toBe('tool-calls');
  expect(result.warnings).toEqual([]);
});

it('should stream a caller-defined json tool call with a JSON response format', async () => {
  server.urls['https://api.anthropic.com/v1/messages'].response = {
    type: 'stream-chunks',
    chunks: [
      `data: ${JSON.stringify({
        type: 'message_start',
        message: {
          id: 'msg_json_tool',
          type: 'message',
          role: 'assistant',
          content: [],
          model: 'claude-3-haiku-20240307',
          stop_reason: null,
          stop_sequence: null,
          usage: {
            input_tokens: 10,
            output_tokens: 1,
          },
        },
      })}\n\n`,
      `data: ${JSON.stringify({
        type: 'content_block_start',
        index: 0,
        content_block: {
          type: 'tool_use',
          id: 'toolu_json',
          name: 'json',
          input: {},
        },
      })}\n\n`,
      `data: ${JSON.stringify({
        type: 'content_block_delta',
        index: 0,
        delta: {
          type: 'input_json_delta',
          partial_json: '{"value":"caller tool"}',
        },
      })}\n\n`,
      `data: ${JSON.stringify({
        type: 'content_block_stop',
        index: 0,
      })}\n\n`,
      `data: ${JSON.stringify({
        type: 'message_delta',
        delta: {
          stop_reason: 'tool_use',
          stop_sequence: null,
        },
        usage: {
          input_tokens: 10,
          output_tokens: 5,
        },
      })}\n\n`,
      `data: ${JSON.stringify({ type: 'message_stop' })}\n\n`,
      'data: [DONE]\n\n',
    ],
  };

  const { stream } = await model.doStream({
    prompt: TEST_PROMPT,
    tools: [JSON_TOOL],
    responseFormat: JSON_RESPONSE_FORMAT,
  });

  expect(await server.calls[0].requestBodyJson).toMatchObject({
    tool_choice: {
      disable_parallel_tool_use: true,
      type: 'any',
    },
    tools: [
      expect.objectContaining({ name: 'json' }),
      expect.objectContaining({ name: 'json_1' }),
    ],
  });
  expect(await convertReadableStreamToArray(stream)).toEqual(
    expect.arrayContaining([
      {
        type: 'tool-call',
        toolCallId: 'toolu_json',
        toolName: 'json',
        input: '{"value":"caller tool"}',
        providerExecuted: undefined,
      },
      expect.objectContaining({
        type: 'finish',
        finishReason: 'tool-calls',
      }),
    ]),
  );
});
