import type {
  JSONSchema7,
  LanguageModelV4CallOptions,
  LanguageModelV4Prompt,
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

function streamChunks(events: unknown[]) {
  return [
    ...[
      {
        type: 'message_start',
        message: {
          id: 'msg_1',
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
        delta: { stop_reason: 'end_turn', stop_sequence: null },
        usage: { output_tokens: 20 },
      },
      { type: 'message_stop' },
    ].map(event => `data: ${JSON.stringify(event)}\n\n`),
    'data: [DONE]\n\n',
  ];
}

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

describe('JSON response tool fallback', () => {
  const server = createTestServer({ [URL]: {} });

  function respondWithJson(content: unknown[]) {
    server.urls[URL].response = {
      type: 'json-value',
      body: messageResponse(content),
    };
  }

  function respondWithStream(events: unknown[]) {
    server.urls[URL].response = {
      type: 'stream-chunks',
      chunks: streamChunks(events),
    };
  }

  describe('models that reject forced tool use', () => {
    it.each(['claude-sonnet-5-5', 'claude-opus-5-5', 'claude-fable-5-1'])(
      'uses native structured outputs for %s when the provider disables them by default',
      async modelId => {
        respondWithJson([{ type: 'text', text: '{"answer":"42"}' }]);

        const result = await createModel(modelId).doGenerate(jsonCall(SCHEMA));

        const body = await server.calls[0].requestBodyJson;
        expect(body.output_config?.format).toEqual({
          type: 'json_schema',
          schema: SCHEMA,
        });
        expect(body.tools).toBeUndefined();
        expect(body.tool_choice).toBeUndefined();
        expect(result.content).toEqual([
          { type: 'text', text: '{"answer":"42"}' },
        ]);
      },
    );

    it('keeps the JSON response tool for self-referencing schemas', async () => {
      respondWithJson([{ type: 'text', text: '{"root":{}}' }]);

      await createModel('claude-sonnet-5-5').doGenerate(
        jsonCall(CIRCULAR_SCHEMA),
      );

      const body = await server.calls[0].requestBodyJson;
      expect(body.output_config).toBeUndefined();
      expect(body.tools.map((tool: { name: string }) => tool.name)).toEqual([
        'json',
      ]);
      expect(body.tool_choice).toMatchObject({ type: 'auto' });
    });

    it('still uses the JSON response tool for models that accept forced tool use', async () => {
      respondWithJson([
        {
          type: 'tool_use',
          id: 'toolu_1',
          name: 'json',
          input: { answer: '42' },
        },
      ]);

      await createModel('claude-sonnet-4-6').doGenerate(jsonCall(SCHEMA));

      const body = await server.calls[0].requestBodyJson;
      expect(body.output_config).toBeUndefined();
      expect(body.tool_choice).toMatchObject({ type: 'any' });
    });
  });

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
      respondWithStream(textBlockEvents(0, ['{"root"', ':{}}']));

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
      respondWithStream([
        ...textBlockEvents(0, ['Here is the JSON:']),
        ...jsonToolBlockEvents(1, '{"root":{}}'),
      ]);

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
});
