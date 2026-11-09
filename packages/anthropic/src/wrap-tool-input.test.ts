import type {
  JSONSchema7,
  LanguageModelV4CallOptions,
  LanguageModelV4Prompt,
} from '@ai-sdk/provider';
import { convertReadableStreamToArray } from '@ai-sdk/provider-utils/test';
import { createTestServer } from '@ai-sdk/test-server/with-vitest';
import { describe, expect, it } from 'vitest';
import { AnthropicLanguageModel } from './anthropic-language-model';
import {
  needsToolInputWrapping,
  unwrapToolInput,
  unwrapToolInputString,
  wrapToolInput,
  wrapToolInputSchema,
} from './wrap-tool-input';

const URL = 'https://api.anthropic.com/v1/messages';

const UNION_SCHEMA: JSONSchema7 = {
  oneOf: [
    {
      type: 'object',
      properties: { kind: { const: 'a' }, x: { type: 'string' } },
      required: ['kind', 'x'],
    },
    {
      type: 'object',
      properties: { kind: { const: 'b' }, y: { type: 'number' } },
      required: ['kind', 'y'],
    },
  ],
};

describe('needsToolInputWrapping', () => {
  it.each([
    ['oneOf root', UNION_SCHEMA],
    ['anyOf root', { anyOf: [{ type: 'object' }, { type: 'string' }] }],
    ['allOf root', { allOf: [{ type: 'object' }, { type: 'object' }] }],
    [
      'object root with anyOf',
      { type: 'object', anyOf: [{ required: ['a'] }] },
    ],
    ['$ref root', { $ref: '#/definitions/a', definitions: { a: {} } }],
    ['primitive root', { type: 'string' }],
    ['nullable object root', { type: ['object', 'null'] }],
    ['typeless root', {}],
  ] as Array<[string, JSONSchema7]>)('wraps %s', (_, schema) => {
    expect(needsToolInputWrapping(schema)).toBe(true);
  });

  it.each([
    ['object', { type: 'object', properties: { a: { type: 'string' } } }],
    [
      'object with nested union',
      { type: 'object', properties: { a: UNION_SCHEMA } },
    ],
  ] as Array<[string, JSONSchema7]>)('does not wrap %s root', (_, schema) => {
    expect(needsToolInputWrapping(schema)).toBe(false);
  });
});

describe('wrapToolInputSchema', () => {
  it('nests the schema in an input property', () => {
    expect(wrapToolInputSchema(UNION_SCHEMA)).toEqual({
      type: 'object',
      properties: { input: UNION_SCHEMA },
      required: ['input'],
      additionalProperties: false,
    });
  });

  it('keeps $schema and definitions at the root', () => {
    expect(
      wrapToolInputSchema({
        $schema: 'http://json-schema.org/draft-07/schema#',
        definitions: { a: { type: 'string' } },
        anyOf: [{ $ref: '#/definitions/a' }, { type: 'number' }],
      }),
    ).toEqual({
      $schema: 'http://json-schema.org/draft-07/schema#',
      definitions: { a: { type: 'string' } },
      type: 'object',
      properties: {
        input: { anyOf: [{ $ref: '#/definitions/a' }, { type: 'number' }] },
      },
      required: ['input'],
      additionalProperties: false,
    });
  });

  it('points references to the schema root into the input property', () => {
    expect(
      wrapToolInputSchema({
        anyOf: [
          { type: 'string' },
          { type: 'array', items: { $ref: '#' } },
          { $ref: '#/anyOf/0' },
        ],
        $defs: { node: { $ref: '#' } },
      } as JSONSchema7),
    ).toMatchObject({
      $defs: { node: { $ref: '#/properties/input' } },
      properties: {
        input: {
          anyOf: [
            { type: 'string' },
            { type: 'array', items: { $ref: '#/properties/input' } },
            { $ref: '#/properties/input/anyOf/0' },
          ],
        },
      },
    });
  });
});

describe('wrapToolInput / unwrapToolInput', () => {
  it('wraps the parsed input', () => {
    expect(wrapToolInput({ kind: 'a' })).toEqual({ input: { kind: 'a' } });
    expect(wrapToolInput([1, 2])).toEqual({ input: [1, 2] });
  });

  it('keeps string input as a string', () => {
    expect(wrapToolInput('hello')).toEqual({ input: 'hello' });
    expect(wrapToolInput('123')).toEqual({ input: '123' });
    expect(wrapToolInput('{"kind":"a"}')).toEqual({ input: '{"kind":"a"}' });
  });

  it('unwraps the input property, including non-object values', () => {
    expect(unwrapToolInput({ input: { kind: 'a' } })).toEqual({ kind: 'a' });
    expect(unwrapToolInput({ input: 'text' })).toBe('text');
    expect(unwrapToolInputString('{"input":[1,2]}')).toBe('[1,2]');
  });

  it('returns input without the wrapped shape unchanged', () => {
    expect(unwrapToolInput({ kind: 'a' })).toEqual({ kind: 'a' });
    expect(unwrapToolInput({ input: 1, other: 2 })).toEqual({
      input: 1,
      other: 2,
    });
    expect(unwrapToolInputString('{"input"')).toBe('{"input"');
  });
});

describe('wrapped tool inputs in the language model', () => {
  const server = createTestServer({ [URL]: {} });

  const model = new AnthropicLanguageModel('claude-sonnet-4-5', {
    provider: 'anthropic.messages',
    baseURL: 'https://api.anthropic.com/v1',
    headers: { 'x-api-key': 'test-api-key' },
  });

  const OBJECT_SCHEMA: JSONSchema7 = {
    type: 'object',
    properties: { q: { type: 'string' } },
    required: ['q'],
  };

  const prompt: LanguageModelV4Prompt = [
    { role: 'user', content: [{ type: 'text', text: 'Hello' }] },
  ];

  const tools: LanguageModelV4CallOptions['tools'] = [
    {
      type: 'function',
      name: 'lookup',
      description: 'Look something up',
      inputSchema: UNION_SCHEMA,
      inputExamples: [{ input: { kind: 'a', x: 'hi' } }],
    },
    { type: 'function', name: 'search', inputSchema: OBJECT_SCHEMA },
  ];

  const message = (content: unknown[]) => ({
    id: 'msg_1',
    type: 'message',
    role: 'assistant',
    model: 'claude-sonnet-4-5',
    content,
    stop_reason: 'tool_use',
    stop_sequence: null,
    usage: { input_tokens: 10, output_tokens: 20 },
  });

  const streamEvents = (blocks: unknown[]) =>
    [
      { type: 'message_start', message: { ...message([]), content: [] } },
      ...blocks,
      {
        type: 'message_delta',
        delta: { stop_reason: 'tool_use', stop_sequence: null },
        usage: { output_tokens: 20 },
      },
      { type: 'message_stop' },
    ]
      .map(event => `data: ${JSON.stringify(event)}\n\n`)
      .concat('data: [DONE]\n\n');

  const toolUseBlock = (index: number, name: string, deltas: string[]) => [
    {
      type: 'content_block_start',
      index,
      content_block: {
        type: 'tool_use',
        id: `toolu_${index}`,
        name,
        input: {},
      },
    },
    ...deltas.map(partial_json => ({
      type: 'content_block_delta',
      index,
      delta: { type: 'input_json_delta', partial_json },
    })),
    { type: 'content_block_stop', index },
  ];

  it('sends wrapped schemas and examples only for tools that need them', async () => {
    server.urls[URL].response = {
      type: 'json-value',
      body: message([{ type: 'text', text: 'ok' }]),
    };

    await model.doGenerate({ prompt, tools });

    const body = await server.calls[0].requestBodyJson;
    expect(body.tools).toMatchObject([
      {
        name: 'lookup',
        input_schema: {
          type: 'object',
          properties: { input: UNION_SCHEMA },
          required: ['input'],
        },
        input_examples: [{ input: { kind: 'a', x: 'hi' } }],
      },
      { name: 'search', input_schema: OBJECT_SCHEMA },
    ]);
  });

  it('unwraps tool calls in doGenerate', async () => {
    server.urls[URL].response = {
      type: 'json-value',
      body: message([
        {
          type: 'tool_use',
          id: 'toolu_1',
          name: 'lookup',
          input: { input: { kind: 'b', y: 2 } },
        },
        { type: 'tool_use', id: 'toolu_2', name: 'search', input: { q: 'x' } },
      ]),
    };

    const result = await model.doGenerate({ prompt, tools });

    expect(result.content).toMatchObject([
      { type: 'tool-call', toolName: 'lookup', input: '{"kind":"b","y":2}' },
      { type: 'tool-call', toolName: 'search', input: '{"q":"x"}' },
    ]);
  });

  it('unwraps tool calls in doStream and emits the input in one delta', async () => {
    server.urls[URL].response = {
      type: 'stream-chunks',
      chunks: streamEvents([
        ...toolUseBlock(0, 'lookup', [
          '{"inp',
          'ut":{"kind":',
          '"a","x":"hi"}}',
        ]),
        ...toolUseBlock(1, 'search', ['{"q":', '"x"}']),
      ]),
    };

    const { stream } = await model.doStream({ prompt, tools });
    const parts = await convertReadableStreamToArray(stream);

    const lookupId = 'toolu_0';
    expect(
      parts.filter(part => 'id' in part && part.id === lookupId),
    ).toMatchObject([
      { type: 'tool-input-start', toolName: 'lookup' },
      { type: 'tool-input-delta', delta: '{"kind":"a","x":"hi"}' },
      { type: 'tool-input-end' },
    ]);
    expect(parts.filter(part => part.type === 'tool-call')).toMatchObject([
      { toolName: 'lookup', input: '{"kind":"a","x":"hi"}' },
      { toolName: 'search', input: '{"q":"x"}' },
    ]);
    // tools without wrapping keep streaming incrementally:
    expect(
      parts.filter(
        part => part.type === 'tool-input-delta' && part.id === 'toolu_1',
      ),
    ).toHaveLength(2);
  });

  it('wraps replayed tool calls in the message history', async () => {
    server.urls[URL].response = {
      type: 'json-value',
      body: message([{ type: 'text', text: 'ok' }]),
    };

    await model.doGenerate({
      prompt: [
        ...prompt,
        {
          role: 'assistant',
          content: [
            {
              type: 'tool-call',
              toolCallId: 'toolu_1',
              toolName: 'lookup',
              input: { kind: 'a', x: 'hi' },
            },
            {
              type: 'tool-call',
              toolCallId: 'toolu_2',
              toolName: 'search',
              input: { q: 'x' },
            },
          ],
        },
        {
          role: 'tool',
          content: [
            {
              type: 'tool-result',
              toolCallId: 'toolu_1',
              toolName: 'lookup',
              output: { type: 'text', value: 'r1' },
            },
            {
              type: 'tool-result',
              toolCallId: 'toolu_2',
              toolName: 'search',
              output: { type: 'text', value: 'r2' },
            },
          ],
        },
      ],
      tools,
    });

    const body = await server.calls[0].requestBodyJson;
    expect(body.messages[1].content).toMatchObject([
      {
        type: 'tool_use',
        name: 'lookup',
        input: { input: { kind: 'a', x: 'hi' } },
      },
      { type: 'tool_use', name: 'search', input: { q: 'x' } },
    ]);
  });

  it('replays string-valued input of wrapped tools as a string', async () => {
    server.urls[URL].response = {
      type: 'json-value',
      body: message([{ type: 'text', text: 'ok' }]),
    };

    await model.doGenerate({
      prompt: [
        ...prompt,
        {
          role: 'assistant',
          content: [
            {
              type: 'tool-call',
              toolCallId: 'toolu_1',
              toolName: 'echo',
              input: '123',
            },
          ],
        },
        {
          role: 'tool',
          content: [
            {
              type: 'tool-result',
              toolCallId: 'toolu_1',
              toolName: 'echo',
              output: { type: 'text', value: 'r1' },
            },
          ],
        },
      ],
      tools: [
        {
          type: 'function',
          name: 'echo',
          inputSchema: { anyOf: [{ type: 'string' }, { type: 'object' }] },
        },
      ],
    });

    const body = await server.calls[0].requestBodyJson;
    expect(body.messages[1].content[0].input).toEqual({ input: '123' });
  });

  describe('JSON response tool', () => {
    const jsonCall: LanguageModelV4CallOptions = {
      prompt,
      responseFormat: { type: 'json', schema: UNION_SCHEMA },
      providerOptions: { anthropic: { structuredOutputMode: 'jsonTool' } },
    };

    it('sends the wrapped schema and unwraps the text in doGenerate', async () => {
      server.urls[URL].response = {
        type: 'json-value',
        body: message([
          {
            type: 'tool_use',
            id: 'toolu_1',
            name: 'json',
            input: { input: { kind: 'a', x: 'hi' } },
          },
        ]),
      };

      const result = await model.doGenerate(jsonCall);

      expect((await server.calls[0].requestBodyJson).tools[0]).toMatchObject({
        name: 'json',
        input_schema: { properties: { input: UNION_SCHEMA } },
      });
      expect(result.content).toEqual([
        { type: 'text', text: '{"kind":"a","x":"hi"}' },
      ]);
    });

    it('unwraps the text in doStream', async () => {
      server.urls[URL].response = {
        type: 'stream-chunks',
        chunks: streamEvents(
          toolUseBlock(0, 'json', ['{"input":{"kind":', '"a","x":"hi"}}']),
        ),
      };

      const { stream } = await model.doStream(jsonCall);
      const parts = await convertReadableStreamToArray(stream);

      expect(
        parts
          .filter(part => part.type === 'text-delta')
          .map(part => part.delta)
          .join(''),
      ).toBe('{"kind":"a","x":"hi"}');
    });
  });
});
