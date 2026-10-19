import {
  InvalidResponseDataError,
  type JSONSchema7,
  type LanguageModelV4FunctionTool,
  type LanguageModelV4Prompt,
} from '@ai-sdk/provider';
import { asSchema } from '@ai-sdk/provider-utils';
import { convertReadableStreamToArray } from '@ai-sdk/provider-utils/test';
import { createTestServer } from '@ai-sdk/test-server/with-vitest';
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import * as z3 from 'zod/v3';
import * as z4 from 'zod/v4';
import { createAnthropic } from './anthropic-provider';

const url = 'https://api.anthropic.com/v1/messages';
const server = createTestServer({ [url]: {} });
const provider = createAnthropic({ apiKey: 'test-api-key' });
const model = provider('claude-sonnet-4-6');
const prompt: LanguageModelV4Prompt = [
  { role: 'user', content: [{ type: 'text', text: 'Look up item 123.' }] },
];
const input = { action: 'lookup', id: '123' };
const wrappedInput = { __ai_sdk_tool_input: input };
const unionTool: LanguageModelV4FunctionTool = {
  type: 'function',
  name: 'lookup',
  inputSchema: {
    oneOf: [
      { type: 'object', properties: { id: { type: 'string' } } },
      { type: 'object', properties: { query: { type: 'string' } } },
    ],
  },
};

function toolUse(value: unknown = wrappedInput, name = 'lookup') {
  return { type: 'tool_use', id: `call_${name}`, name, input: value };
}

function message(content: unknown[] = [toolUse()]) {
  return {
    id: 'msg_test',
    type: 'message',
    role: 'assistant',
    model: 'claude-sonnet-4-6',
    content,
    stop_reason: 'tool_use',
    stop_sequence: null,
    usage: { input_tokens: 10, output_tokens: 20 },
  };
}

function jsonResponse(content?: unknown[]) {
  server.urls[url].response = { type: 'json-value', body: message(content) };
}

function streamResponse(events: unknown[], initialContent: unknown[] = []) {
  server.urls[url].response = {
    type: 'stream-chunks',
    chunks: [
      {
        type: 'message_start',
        message: { ...message(initialContent), stop_reason: null },
      },
      ...events,
      {
        type: 'message_delta',
        delta: { stop_reason: 'tool_use', stop_sequence: null },
        usage: { output_tokens: 20 },
      },
      { type: 'message_stop' },
    ].map(event => `data: ${JSON.stringify(event)}\n\n`),
  };
}

describe('automatic Anthropic tool input wrapping', () => {
  it('unwraps a recorded non-streaming tool call', async () => {
    server.urls[url].response = {
      type: 'json-value',
      body: JSON.parse(
        readFileSync(
          new URL(
            './__fixtures__/anthropic-tool-call-root-union.1.json',
            import.meta.url,
          ),
          'utf8',
        ),
      ),
    };
    const result = await model.doGenerate({ prompt, tools: [unionTool] });
    expect(result.content.filter(part => part.type === 'tool-call')).toEqual([
      expect.objectContaining({
        toolName: 'lookup',
        input: JSON.stringify(input),
        providerMetadata: {
          anthropic: {
            toolInputWrapped: true,
            caller: { type: 'direct', toolId: undefined },
          },
        },
      }),
    ]);
  });

  it('unwraps a recorded streaming tool call', async () => {
    server.urls[url].response = {
      type: 'stream-chunks',
      chunks: readFileSync(
        new URL(
          './__fixtures__/anthropic-tool-call-root-union.1.chunks.txt',
          import.meta.url,
        ),
        'utf8',
      )
        .trim()
        .split('\n')
        .map(chunk => `data: ${chunk}\n\n`),
    };
    const { stream } = await model.doStream({ prompt, tools: [unionTool] });
    const parts = await convertReadableStreamToArray(stream);
    expect(parts.filter(part => part.type === 'tool-input-delta')).toEqual([
      expect.objectContaining({ delta: JSON.stringify(input) }),
    ]);
    expect(parts.filter(part => part.type === 'tool-call')).toEqual([
      expect.objectContaining({
        toolName: 'lookup',
        input: JSON.stringify(input),
        providerMetadata: {
          anthropic: {
            toolInputWrapped: true,
            caller: { type: 'direct', toolId: undefined },
          },
        },
      }),
    ]);
  });

  it.each([
    [
      'Zod 3',
      z3.discriminatedUnion('action', [
        z3.object({ action: z3.literal('lookup'), id: z3.string() }),
        z3.object({ action: z3.literal('search'), query: z3.string() }),
      ]),
    ],
    [
      'Zod 4',
      z4.discriminatedUnion('action', [
        z4.object({ action: z4.literal('lookup'), id: z4.string() }),
        z4.object({ action: z4.literal('search'), query: z4.string() }),
      ]),
    ],
  ] as const)(
    'round-trips %s root unions and input examples',
    async (_, schema) => {
      jsonResponse();
      const inputSchema = await asSchema(schema).jsonSchema;
      const tool = { ...unionTool, inputSchema, inputExamples: [{ input }] };
      const original = structuredClone(tool);
      const result = await model.doGenerate({ prompt, tools: [tool] });
      const body = await server.calls[0].requestBodyJson;

      expect(body.tools[0].input_schema).toEqual({
        ...(inputSchema.$schema && { $schema: inputSchema.$schema }),
        type: 'object',
        properties: { __ai_sdk_tool_input: inputSchema },
        required: ['__ai_sdk_tool_input'],
        additionalProperties: false,
      });
      expect(body.tools[0].input_examples).toEqual([wrappedInput]);
      expect(result.content).toEqual([
        {
          type: 'tool-call',
          toolCallId: 'call_lookup',
          toolName: 'lookup',
          input: JSON.stringify(input),
          providerMetadata: { anthropic: { toolInputWrapped: true } },
        },
      ]);
      expect(tool).toEqual(original);
    },
  );

  it.each([
    [{ type: 'string' }, ''],
    [{ type: 'number' }, 0],
    [{ type: 'boolean' }, false],
    [{ type: 'null' }, null],
    [{ type: 'array', items: { type: 'number' } }, [1, 2]],
  ] satisfies Array<[JSONSchema7, unknown]>)(
    'round-trips non-object roots: %j',
    async (inputSchema, value) => {
      jsonResponse([toolUse({ __ai_sdk_tool_input: value })]);
      const result = await model.doGenerate({
        prompt,
        tools: [{ ...unionTool, inputSchema }],
      });
      expect(result.content[0]).toMatchObject({ input: JSON.stringify(value) });
    },
  );

  it('preserves compatible tools and distinguishes a user property with the wrapper name', async () => {
    const inputSchema: JSONSchema7 = {
      type: 'object',
      properties: { __ai_sdk_tool_input: { type: 'string' } },
    };
    const value = { __ai_sdk_tool_input: 'user value' };
    jsonResponse([toolUse(value)]);
    const result = await model.doGenerate({
      prompt,
      tools: [{ ...unionTool, inputSchema }],
    });

    expect(
      (await server.calls[0].requestBodyJson).tools[0].input_schema,
    ).toEqual(inputSchema);
    expect(result.content[0]).toMatchObject({ input: JSON.stringify(value) });
    expect(result.content[0].providerMetadata).toBeUndefined();
  });

  it.each([true, false])(
    'replays unwrapped history when the tool remains active: %s',
    async active => {
      jsonResponse();
      const first = await model.doGenerate({ prompt, tools: [unionTool] });
      const call = first.content[0];
      if (call.type !== 'tool-call') throw new Error('Expected a tool call');
      const history: LanguageModelV4Prompt = [
        ...prompt,
        {
          role: 'assistant',
          content: [
            {
              type: 'tool-call',
              toolCallId: call.toolCallId,
              toolName: call.toolName,
              input: JSON.parse(call.input),
              providerOptions: call.providerMetadata,
            },
          ],
        },
        {
          role: 'tool',
          content: [
            {
              type: 'tool-result',
              toolCallId: call.toolCallId,
              toolName: call.toolName,
              output: { type: 'text', value: 'Example item' },
            },
          ],
        },
      ];
      const original = structuredClone(history);
      jsonResponse([{ type: 'text', text: 'Example item' }]);
      await model.doGenerate({
        prompt: history,
        tools: active ? [unionTool] : undefined,
      });

      const body = await server.calls[1].requestBodyJson;
      expect(body.messages[1].content[0]).toMatchObject({
        input: wrappedInput,
      });
      expect(body.messages[2].content[0]).toMatchObject({
        type: 'tool_result',
        content: 'Example item',
      });
      expect(history).toEqual(original);
    },
  );

  it('wraps history from another provider using the current schema', async () => {
    jsonResponse([{ type: 'text', text: 'Example item' }]);
    await model.doGenerate({
      tools: [unionTool],
      prompt: [
        ...prompt,
        {
          role: 'assistant',
          content: [
            {
              type: 'tool-call',
              toolCallId: 'previous',
              toolName: 'lookup',
              input,
            },
          ],
        },
      ],
    });
    expect(
      (await server.calls[0].requestBodyJson).messages[1].content[0].input,
    ).toEqual(wrappedInput);
  });

  it.each([{}, { __ai_sdk_tool_input: input, extra: true }])(
    'rejects malformed response wrappers: %j',
    async value => {
      jsonResponse([toolUse(value)]);
      await expect(
        model.doGenerate({ prompt, tools: [unionTool] }),
      ).rejects.toThrow(InvalidResponseDataError);
    },
  );

  it('preserves caller metadata for programmatic calls', async () => {
    const caller = { type: 'code_execution_20260120', tool_id: 'caller' };
    jsonResponse([{ ...toolUse(), caller }]);
    const result = await model.doGenerate({ prompt, tools: [unionTool] });
    expect(result.content[0].providerMetadata).toEqual({
      anthropic: {
        toolInputWrapped: true,
        caller: { type: caller.type, toolId: 'caller' },
      },
    });
  });

  it.each(['deltas', 'block-start', 'message-start'] as const)(
    'unwraps streamed input from %s',
    async source => {
      const events =
        source === 'message-start'
          ? []
          : [
              {
                type: 'content_block_start',
                index: 0,
                content_block: toolUse(
                  source === 'block-start' ? wrappedInput : {},
                ),
              },
              ...(source === 'deltas'
                ? [...JSON.stringify(wrappedInput)].map(character => ({
                    type: 'content_block_delta',
                    index: 0,
                    delta: {
                      type: 'input_json_delta',
                      partial_json: character,
                    },
                  }))
                : []),
              { type: 'content_block_stop', index: 0 },
            ];
      streamResponse(events, source === 'message-start' ? [toolUse()] : []);
      const { stream } = await model.doStream({ prompt, tools: [unionTool] });
      const parts = await convertReadableStreamToArray(stream);

      expect(parts.filter(part => part.type.startsWith('tool-'))).toEqual([
        { type: 'tool-input-start', id: 'call_lookup', toolName: 'lookup' },
        {
          type: 'tool-input-delta',
          id: 'call_lookup',
          delta: JSON.stringify(input),
        },
        { type: 'tool-input-end', id: 'call_lookup' },
        expect.objectContaining({
          type: 'tool-call',
          toolCallId: 'call_lookup',
          toolName: 'lookup',
          input: JSON.stringify(input),
          providerMetadata: { anthropic: { toolInputWrapped: true } },
        }),
      ]);
    },
  );

  it('keeps interleaved wrapped and compatible tool inputs separate', async () => {
    const raw = JSON.stringify(wrappedInput);
    streamResponse([
      { type: 'content_block_start', index: 0, content_block: toolUse({}) },
      {
        type: 'content_block_start',
        index: 1,
        content_block: toolUse({}, 'other'),
      },
      {
        type: 'content_block_delta',
        index: 0,
        delta: { type: 'input_json_delta', partial_json: raw.slice(0, 20) },
      },
      {
        type: 'content_block_delta',
        index: 1,
        delta: { type: 'input_json_delta', partial_json: '{"value":1}' },
      },
      {
        type: 'content_block_delta',
        index: 0,
        delta: { type: 'input_json_delta', partial_json: raw.slice(20) },
      },
      { type: 'content_block_stop', index: 1 },
      { type: 'content_block_stop', index: 0 },
    ]);
    const { stream } = await model.doStream({
      prompt,
      tools: [
        unionTool,
        { type: 'function', name: 'other', inputSchema: { type: 'object' } },
      ],
    });
    const parts = await convertReadableStreamToArray(stream);
    expect(parts.filter(part => part.type === 'tool-input-delta')).toEqual([
      { type: 'tool-input-delta', id: 'call_other', delta: '{"value":1}' },
      {
        type: 'tool-input-delta',
        id: 'call_lookup',
        delta: JSON.stringify(input),
      },
    ]);
  });

  it.each([
    '{}',
    '{"__ai_sdk_tool_input":',
    '{"__ai_sdk_tool_input":{},"extra":1}',
  ])(
    'reports invalid streamed envelopes without emitting a tool call: %s',
    async raw => {
      streamResponse([
        { type: 'content_block_start', index: 0, content_block: toolUse({}) },
        {
          type: 'content_block_delta',
          index: 0,
          delta: { type: 'input_json_delta', partial_json: raw },
        },
        { type: 'content_block_stop', index: 0 },
      ]);
      const { stream } = await model.doStream({ prompt, tools: [unionTool] });
      const parts = await convertReadableStreamToArray(stream);
      expect(parts.filter(part => part.type === 'error')).toHaveLength(1);
      expect(
        parts.filter(
          part => part.type === 'tool-call' || part.type === 'tool-input-delta',
        ),
      ).toEqual([]);
    },
  );

  it('does not relocate schemas for tools omitted from the request', async () => {
    jsonResponse([{ type: 'text', text: 'OK' }]);
    await model.doGenerate({
      prompt,
      tools: [{ ...unionTool, inputSchema: { $id: 'scoped' } }],
      toolChoice: { type: 'none' },
    });
    expect((await server.calls[0].requestBodyJson).tools).toBeUndefined();
  });
});
