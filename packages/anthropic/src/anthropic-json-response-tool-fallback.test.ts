import type {
  JSONSchema7,
  LanguageModelV2CallOptions,
  LanguageModelV2Prompt,
  LanguageModelV2StreamPart,
} from '@ai-sdk/provider';
import { convertReadableStreamToArray } from '@ai-sdk/provider-utils/test';
import { createTestServer } from '@ai-sdk/test-server/with-vitest';
import { describe, expect, it } from 'vitest';
import { AnthropicMessagesLanguageModel } from './anthropic-messages-language-model';

const URL = 'https://api.anthropic.com/v1/messages';

const TEST_PROMPT: LanguageModelV2Prompt = [
  { role: 'user', content: [{ type: 'text', text: 'Hello' }] },
];

const SCHEMA: JSONSchema7 = {
  type: 'object',
  properties: { answer: { type: 'string' } },
  required: ['answer'],
  additionalProperties: false,
};

const CIRCULAR_SCHEMA: JSONSchema7 = {
  type: 'object',
  properties: { root: { $ref: '#/$defs/node' } },
  required: ['root'],
  additionalProperties: false,
  $defs: {
    node: {
      type: 'object',
      properties: {
        name: { type: 'string' },
        children: { type: 'array', items: { $ref: '#/$defs/node' } },
      },
      required: ['name', 'children'],
      additionalProperties: false,
    },
  },
} as JSONSchema7;

// The call options below select jsonTool mode for response-path tests;
// open-schema tests explicitly select auto to exercise native-output fallback.
function createModel(modelId: string) {
  return new AnthropicMessagesLanguageModel(modelId, {
    provider: 'test-provider.messages',
    baseURL: 'https://api.anthropic.com/v1',
    headers: { 'x-api-key': 'test-api-key' },
  });
}

function jsonCall(
  schema: JSONSchema7,
  extra: Partial<LanguageModelV2CallOptions> = {},
): LanguageModelV2CallOptions {
  return {
    prompt: TEST_PROMPT,
    responseFormat: { type: 'json', schema },
    providerOptions: { anthropic: { structuredOutputMode: 'jsonTool' } },
    ...extra,
  };
}

function messageResponse(content: unknown[]) {
  return {
    id: 'msg_1',
    type: 'message',
    role: 'assistant',
    model: 'claude-sonnet-5-5',
    content,
    stop_reason: content.some(
      part => (part as { type: string }).type === 'tool_use',
    )
      ? 'tool_use'
      : 'end_turn',
    stop_sequence: null,
    usage: { input_tokens: 10, output_tokens: 20 },
  };
}

function messageEvents(
  events: unknown[],
  { id = 'msg_1', stopReason = 'end_turn' } = {},
) {
  return [
    {
      type: 'message_start',
      message: {
        id,
        type: 'message',
        role: 'assistant',
        model: 'claude-sonnet-5-5',
        content: [],
        stop_reason: null,
        stop_sequence: null,
        usage: { input_tokens: 10, output_tokens: 1 },
      },
    },
    ...events,
    {
      type: 'message_delta',
      delta: { stop_reason: stopReason, stop_sequence: null },
      usage: { output_tokens: 20 },
    },
    { type: 'message_stop' },
  ];
}

function streamChunks(events: unknown[]) {
  return [
    ...events.map(event => `data: ${JSON.stringify(event)}\n\n`),
    'data: [DONE]\n\n',
  ];
}

const toolBlockEvents = (index: number, name: string) => [
  {
    type: 'content_block_start',
    index,
    content_block: { type: 'tool_use', id: `toolu_${index}`, name, input: {} },
  },
  {
    type: 'content_block_delta',
    index,
    delta: { type: 'input_json_delta', partial_json: '{}' },
  },
  { type: 'content_block_stop', index },
];

const textBlockEvents = (index: number, deltas: string[]) => [
  {
    type: 'content_block_start',
    index,
    content_block: { type: 'text', text: '' },
  },
  ...deltas.map(text => ({
    type: 'content_block_delta',
    index,
    delta: { type: 'text_delta', text },
  })),
  { type: 'content_block_stop', index },
];

const jsonToolBlockEvents = (index: number, json: string, name = 'json') => [
  {
    type: 'content_block_start',
    index,
    content_block: { type: 'tool_use', id: 'toolu_1', name, input: {} },
  },
  {
    type: 'content_block_delta',
    index,
    delta: { type: 'input_json_delta', partial_json: json },
  },
  { type: 'content_block_stop', index },
];

const thinkingBlockEvents = (index: number, thinking: string) => [
  {
    type: 'content_block_start',
    index,
    content_block: { type: 'thinking', thinking: '' },
  },
  {
    type: 'content_block_delta',
    index,
    delta: { type: 'thinking_delta', thinking },
  },
  {
    type: 'content_block_delta',
    index,
    delta: { type: 'signature_delta', signature: 'sig' },
  },
  { type: 'content_block_stop', index },
];

describe('JSON response tool fallback', () => {
  const server = createTestServer({ [URL]: {} });

  function respondWithJson(content: unknown[]) {
    server.urls[URL].response = {
      type: 'json-value',
      body: messageResponse(content),
    };
  }

  // Each argument is one message in the same provider stream.
  function respondWithStream(...messages: unknown[][]) {
    server.urls[URL].response = {
      type: 'stream-chunks',
      chunks: streamChunks(messages.flat()),
    };
  }

  describe.each([
    'claude-sonnet-5-5',
    'claude-opus-5-5',
    'claude-fable-5-1',
    'claude-fable-5-2',
  ])('%s open-schema fallback', modelId => {
    const options = () =>
      jsonCall(
        { type: 'object', additionalProperties: true },
        { providerOptions: { anthropic: { structuredOutputMode: 'auto' } } },
      );

    it('returns text when the JSON tool is not called (generate)', async () => {
      respondWithJson([{ type: 'text', text: '{"answer":"42"}' }]);
      const result = await createModel(modelId).doGenerate(options());
      expect(result.content).toEqual([
        { type: 'text', text: '{"answer":"42"}' },
      ]);
      const body = await server.calls[0].requestBodyJson;
      expect(body.tools.map((tool: { name: string }) => tool.name)).toEqual([
        'json',
      ]);
      expect(body.tool_choice.type).toBe('auto');
      expect(body.output_config).toBeUndefined();
      expect(result.warnings).not.toContainEqual(
        expect.objectContaining({
          type: 'unsupported-setting',
          setting: 'toolChoice',
        }),
      );
    });

    it('returns text when the JSON tool is not called (stream)', async () => {
      respondWithStream(
        messageEvents(textBlockEvents(0, ['{"answer"', ':"42"}'])),
      );
      const { stream } = await createModel(modelId).doStream(options());
      const parts = await convertReadableStreamToArray(stream);
      expect(
        parts
          .flatMap(part => (part.type === 'text-delta' ? [part.delta] : []))
          .join(''),
      ).toBe('{"answer":"42"}');
    });
  });

  it('recognizes the internal JSON tool when an application tool is named json', async () => {
    const call = jsonCall(CIRCULAR_SCHEMA, {
      tools: [{ type: 'function', name: 'json', inputSchema: SCHEMA }],
    });
    respondWithJson([
      { type: 'text', text: 'Here is the JSON:' },
      { type: 'tool_use', id: 'toolu_1', name: 'json_1', input: { root: {} } },
    ]);
    const generated = await createModel('claude-sonnet-5-5').doGenerate(call);
    expect(generated.content).toEqual([{ type: 'text', text: '{"root":{}}' }]);
    respondWithStream(
      messageEvents([
        ...textBlockEvents(0, ['Here is the JSON:']),
        ...jsonToolBlockEvents(1, '{"root":{}}', 'json_1'),
      ]),
    );
    const { stream } = await createModel('claude-sonnet-5-5').doStream(call);
    const parts = await convertReadableStreamToArray(stream);
    expect(
      parts
        .flatMap(part => (part.type === 'text-delta' ? [part.delta] : []))
        .join(''),
    ).toBe('{"root":{}}');
  });

  describe('doGenerate', () => {
    it('returns text when the model answers without calling the JSON response tool', async () => {
      respondWithJson([{ type: 'text', text: '{"root":{}}' }]);

      const result = await createModel('claude-sonnet-5-5').doGenerate(
        jsonCall(CIRCULAR_SCHEMA),
      );

      expect(result.content).toEqual([{ type: 'text', text: '{"root":{}}' }]);
      expect(result.finishReason).toBe('stop');
    });

    it('drops other text when the JSON response tool is called', async () => {
      respondWithJson([
        { type: 'text', text: 'Here is the JSON:' },
        {
          type: 'tool_use',
          id: 'toolu_1',
          name: 'json',
          input: { root: {} },
        },
      ]);

      const result = await createModel('claude-sonnet-5-5').doGenerate(
        jsonCall(CIRCULAR_SCHEMA),
      );

      expect(result.content).toEqual([{ type: 'text', text: '{"root":{}}' }]);
    });
  });

  describe('doStream', () => {
    it('emits held-back text when the model answers without calling the JSON response tool', async () => {
      respondWithStream(messageEvents(textBlockEvents(0, ['{"root"', ':{}}'])));

      const { stream } = await createModel('claude-sonnet-5-5').doStream(
        jsonCall(CIRCULAR_SCHEMA),
      );
      const parts = await convertReadableStreamToArray(stream);

      expect(parts.filter(part => part.type.startsWith('text-')))
        .toMatchInlineSnapshot(`
        [
          {
            "id": "0",
            "type": "text-start",
          },
          {
            "delta": "{"root":{}}",
            "id": "0",
            "type": "text-delta",
          },
          {
            "id": "0",
            "type": "text-end",
          },
        ]
      `);
      expect(parts.at(-1)).toMatchObject({
        type: 'finish',
        finishReason: 'stop',
      });
    });

    it('drops held-back text when the JSON response tool is called', async () => {
      respondWithStream(
        messageEvents([
          ...textBlockEvents(0, ['Here is the JSON:']),
          ...jsonToolBlockEvents(1, '{"root":{}}'),
        ]),
      );

      const { stream } = await createModel('claude-sonnet-5-5').doStream(
        jsonCall(CIRCULAR_SCHEMA),
      );
      const parts = await convertReadableStreamToArray(stream);

      const text = parts
        .filter(part => part.type === 'text-delta')
        .map(part => (part as { delta: string }).delta)
        .join('');
      expect(text).toBe('{"root":{}}');
    });
  });

  describe('preamble text', () => {
    const textOf = (parts: LanguageModelV2StreamPart[]) =>
      parts
        .flatMap(part => (part.type === 'text-delta' ? [part.delta] : []))
        .join('');

    it('drops text from an earlier message when a later message calls the JSON response tool', async () => {
      respondWithStream(
        messageEvents(
          [
            ...textBlockEvents(0, ['I will check first.']),
            ...toolBlockEvents(1, 'lookup'),
          ],
          { id: 'msg_1', stopReason: 'tool_use' },
        ),
        messageEvents(jsonToolBlockEvents(0, '{"answer":"42"}'), {
          id: 'msg_2',
          stopReason: 'tool_use',
        }),
      );

      const { stream } = await createModel('claude-sonnet-5-5').doStream(
        jsonCall(CIRCULAR_SCHEMA),
      );

      expect(textOf(await convertReadableStreamToArray(stream))).toBe(
        '{"answer":"42"}',
      );
    });

    it('returns only the final message text when the JSON response tool is never called', async () => {
      respondWithStream(
        messageEvents(
          [
            ...textBlockEvents(0, ['I will check first.']),
            ...toolBlockEvents(1, 'lookup'),
          ],
          { id: 'msg_1', stopReason: 'tool_use' },
        ),
        messageEvents(textBlockEvents(0, ['{"answer":"42"}']), { id: 'msg_2' }),
      );

      const { stream } = await createModel('claude-sonnet-5-5').doStream(
        jsonCall(CIRCULAR_SCHEMA),
      );

      expect(textOf(await convertReadableStreamToArray(stream))).toBe(
        '{"answer":"42"}',
      );
    });

    it('drops text from a paused message before the continuation answers', async () => {
      respondWithStream(
        messageEvents(textBlockEvents(0, ['Still working.']), {
          id: 'msg_1',
          stopReason: 'pause_turn',
        }),
        messageEvents(textBlockEvents(0, ['{"answer":"42"}']), { id: 'msg_2' }),
      );

      const { stream } = await createModel('claude-sonnet-5-5').doStream(
        jsonCall(CIRCULAR_SCHEMA),
      );

      expect(textOf(await convertReadableStreamToArray(stream))).toBe(
        '{"answer":"42"}',
      );
    });

    it('drops text before a tool call within a message (stream)', async () => {
      respondWithStream(
        messageEvents([
          ...textBlockEvents(0, ['I will check first.']),
          ...toolBlockEvents(1, 'lookup'),
          ...textBlockEvents(2, ['{"answer":"42"}']),
        ]),
      );

      const { stream } = await createModel('claude-sonnet-5-5').doStream(
        jsonCall(CIRCULAR_SCHEMA),
      );

      expect(textOf(await convertReadableStreamToArray(stream))).toBe(
        '{"answer":"42"}',
      );
    });

    it('drops text before a tool call or result (generate)', async () => {
      respondWithJson([
        { type: 'text', text: 'I will check first.' },
        {
          type: 'server_tool_use',
          id: 'srvtoolu_1',
          name: 'web_search',
          input: { query: 'answer' },
        },
        {
          type: 'web_search_tool_result',
          tool_use_id: 'srvtoolu_1',
          content: [],
        },
        { type: 'text', text: '{"answer":"42"}' },
      ]);

      const result = await createModel('claude-sonnet-5-5').doGenerate(
        jsonCall(CIRCULAR_SCHEMA),
      );

      expect(result.content.filter(part => part.type === 'text')).toEqual([
        { type: 'text', text: '{"answer":"42"}' },
      ]);
    });

    it('returns no text when the response stops for a tool call (generate)', async () => {
      respondWithJson([
        { type: 'text', text: 'I will check first.' },
        { type: 'tool_use', id: 'toolu_1', name: 'lookup', input: {} },
      ]);

      const result = await createModel('claude-sonnet-5-5').doGenerate(
        jsonCall(CIRCULAR_SCHEMA),
      );

      expect(result.content.filter(part => part.type === 'text')).toEqual([]);
    });
  });

  it.each([
    {
      type: 'page_location',
      cited_text: 'Supporting passage',
      document_index: 0,
      document_title: 'Report',
      start_page_number: 1,
      end_page_number: 2,
    },
    {
      type: 'web_search_result_location',
      cited_text: 'Supporting passage',
      title: 'Report',
      url: 'https://example.com/report',
      encrypted_index: 'opaque',
    },
  ])(
    'preserves $type citations on held-back text with generation parity',
    async citation => {
      const call: LanguageModelV2CallOptions = {
        ...jsonCall(CIRCULAR_SCHEMA),
        prompt: [
          {
            role: 'user',
            content: [
              {
                type: 'file',
                data: 'base64PDFdata',
                mediaType: 'application/pdf',
                filename: 'report.pdf',
                providerOptions: {
                  anthropic: { citations: { enabled: true } },
                },
              },
            ],
          },
        ],
      };
      const model = createModel('claude-sonnet-5-5');

      respondWithJson([
        { type: 'text', text: '{"root":{}}', citations: [citation] },
      ]);
      const generated = await model.doGenerate(call);

      respondWithStream(
        messageEvents([
          {
            type: 'content_block_start',
            index: 0,
            content_block: { type: 'text', text: '' },
          },
          {
            type: 'content_block_delta',
            index: 0,
            delta: { type: 'text_delta', text: '{"root":{}}' },
          },
          {
            type: 'content_block_delta',
            index: 0,
            delta: { type: 'citations_delta', citation },
          },
          { type: 'content_block_stop', index: 0 },
        ]),
      );
      const { stream } = await model.doStream(call);
      const parts = await convertReadableStreamToArray(stream);

      const end = parts.find(part => part.type === 'text-end');
      const text = generated.content.find(part => part.type === 'text');
      expect(text?.text).toBe('{"root":{}}');
      expect(end?.providerMetadata).toEqual(text?.providerMetadata);
      // only web search citations are attached to text on this version:
      expect(end?.providerMetadata).toEqual(
        citation.type === 'web_search_result_location'
          ? { anthropic: { citations: [citation] } }
          : undefined,
      );
    },
  );
});
