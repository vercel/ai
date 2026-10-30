import type {
  JSONSchema7,
  LanguageModelV4CallOptions,
  LanguageModelV4Prompt,
  LanguageModelV4StreamPart,
} from '@ai-sdk/provider';
import { convertReadableStreamToArray } from '@ai-sdk/provider-utils/test';
import { createTestServer } from '@ai-sdk/test-server/with-vitest';
import { describe, expect, it } from 'vitest';
import { AnthropicLanguageModel } from './anthropic-language-model';

const URL = 'https://api.anthropic.com/v1/messages';

const TEST_PROMPT: LanguageModelV4Prompt = [
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

// Mirrors provider adapters (e.g. Bedrock, Vertex) that disable native
// structured outputs by default.
function createModel(modelId: string) {
  return new AnthropicLanguageModel(modelId, {
    provider: 'test-provider.messages',
    baseURL: 'https://api.anthropic.com/v1',
    headers: { 'x-api-key': 'test-api-key' },
    supportsNativeStructuredOutput: false,
    supportsStrictTools: false,
  });
}

function jsonCall(
  schema: JSONSchema7,
  extra: Partial<LanguageModelV4CallOptions> = {},
): LanguageModelV4CallOptions {
  return {
    prompt: TEST_PROMPT,
    responseFormat: { type: 'json', schema },
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

const jsonToolBlockEvents = (index: number, json: string) => [
  {
    type: 'content_block_start',
    index,
    content_block: { type: 'tool_use', id: 'toolu_1', name: 'json', input: {} },
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

// Manual thinking also downgrades the forced JSON response tool to auto tool
// choice, for models that otherwise accept forced tool use.
const manualThinkingCall = () =>
  jsonCall(SCHEMA, {
    maxOutputTokens: 10000,
    providerOptions: {
      anthropic: { thinking: { type: 'enabled', budgetTokens: 5000 } },
    },
  });

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

  describe('doGenerate', () => {
    it('returns text when the model answers without calling the JSON response tool', async () => {
      respondWithJson([{ type: 'text', text: '{"root":{}}' }]);

      const result = await createModel('claude-sonnet-5-5').doGenerate(
        jsonCall(CIRCULAR_SCHEMA),
      );

      expect(result.content).toEqual([{ type: 'text', text: '{"root":{}}' }]);
      expect(result.finishReason.unified).toBe('stop');
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
        finishReason: { unified: 'stop' },
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

  describe('manual thinking', () => {
    it('uses the JSON response tool with auto tool choice', async () => {
      respondWithJson([{ type: 'text', text: '{"answer":"42"}' }]);

      await createModel('claude-sonnet-4-5').doGenerate(manualThinkingCall());

      const body = await server.calls[0].requestBodyJson;
      expect(body.thinking).toEqual({ type: 'enabled', budget_tokens: 5000 });
      expect(body.tools.map((tool: { name: string }) => tool.name)).toEqual([
        'json',
      ]);
      expect(body.tool_choice).toMatchObject({ type: 'auto' });
    });

    it('returns text when the model answers without calling the JSON response tool (generate)', async () => {
      respondWithJson([
        { type: 'thinking', thinking: 'Working it out.', signature: 'sig' },
        { type: 'text', text: '{"answer":"42"}' },
      ]);

      const result =
        await createModel('claude-sonnet-4-5').doGenerate(manualThinkingCall());

      expect(result.content.map(part => part.type)).toEqual([
        'reasoning',
        'text',
      ]);
      expect(result.content[1]).toEqual({
        type: 'text',
        text: '{"answer":"42"}',
      });
    });

    it('emits held-back text after reasoning when the model answers without calling the JSON response tool (stream)', async () => {
      respondWithStream(
        messageEvents([
          ...thinkingBlockEvents(0, 'Working it out.'),
          ...textBlockEvents(1, ['{"answer"', ':"42"}']),
        ]),
      );

      const { stream } =
        await createModel('claude-sonnet-4-5').doStream(manualThinkingCall());
      const parts = await convertReadableStreamToArray(stream);

      expect(
        parts
          .filter(
            part =>
              part.type.startsWith('reasoning-') ||
              part.type.startsWith('text-'),
          )
          .map(part => part.type),
      ).toEqual([
        'reasoning-start',
        'reasoning-delta',
        'reasoning-delta',
        'reasoning-end',
        'text-start',
        'text-delta',
        'text-end',
      ]);
      expect(parts.find(part => part.type === 'text-delta')).toMatchObject({
        id: '1',
        delta: '{"answer":"42"}',
      });
      expect(parts.at(-1)).toMatchObject({
        type: 'finish',
        finishReason: { unified: 'stop' },
      });
    });

    it('drops held-back text when the JSON response tool is called after thinking (stream)', async () => {
      respondWithStream(
        messageEvents([
          ...thinkingBlockEvents(0, 'Working it out.'),
          ...textBlockEvents(1, ['Here is the JSON:']),
          ...jsonToolBlockEvents(2, '{"answer":"42"}'),
        ]),
      );

      const { stream } =
        await createModel('claude-sonnet-4-5').doStream(manualThinkingCall());
      const parts = await convertReadableStreamToArray(stream);

      const text = parts
        .filter(part => part.type === 'text-delta')
        .map(part => (part as { delta: string }).delta)
        .join('');
      expect(text).toBe('{"answer":"42"}');
    });
  });

  describe('preamble text', () => {
    const textOf = (parts: LanguageModelV4StreamPart[]) =>
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
      const call: LanguageModelV4CallOptions = {
        ...jsonCall(CIRCULAR_SCHEMA),
        prompt: [
          {
            role: 'user',
            content: [
              {
                type: 'file',
                data: { type: 'data', data: 'base64PDFdata' },
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
      expect(text?.citations).toHaveLength(1);
      expect(end?.citations).toEqual(text?.citations);
      expect(end?.providerMetadata).toEqual({
        anthropic: { citations: [citation] },
      });
    },
  );
});
