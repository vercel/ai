import type {
  JSONSchema7,
  LanguageModelV4CallOptions,
  LanguageModelV4Prompt,
} from '@ai-sdk/provider';
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

function jsonCall(schema: JSONSchema7): LanguageModelV4CallOptions {
  return { prompt: TEST_PROMPT, responseFormat: { type: 'json', schema } };
}

describe('structured outputs for models that reject forced tool use', () => {
  const server = createTestServer({ [URL]: {} });

  function respondWith(content: unknown[]) {
    server.urls[URL].response = {
      type: 'json-value',
      body: {
        id: 'msg_1',
        type: 'message',
        role: 'assistant',
        model: 'claude-sonnet-5-5',
        content,
        stop_reason: 'end_turn',
        stop_sequence: null,
        usage: { input_tokens: 10, output_tokens: 20 },
      },
    };
  }

  it.each(['claude-sonnet-5-5', 'claude-opus-5-5', 'claude-fable-5-1'])(
    'uses native structured outputs for %s when the provider disables them by default',
    async modelId => {
      respondWith([{ type: 'text', text: '{"answer":"42"}' }]);

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

  it('keeps definitions for a top-level $ref schema', async () => {
    respondWith([{ type: 'text', text: '{"answer":"42"}' }]);
    const schema = {
      $ref: '#/definitions/Answer',
      definitions: { Answer: SCHEMA },
    } as JSONSchema7;

    await createModel('claude-sonnet-5-5').doGenerate(jsonCall(schema));

    const body = await server.calls[0].requestBodyJson;
    expect(body.output_config?.format?.schema).toEqual(schema);
  });

  it('keeps the JSON response tool for self-referencing schemas', async () => {
    respondWith([{ type: 'text', text: '{"root":{}}' }]);

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

  it.each([
    [
      'a map field',
      {
        type: 'object',
        properties: {
          scores: { type: 'object', additionalProperties: { type: 'number' } },
        },
        required: ['scores'],
        additionalProperties: false,
      },
    ],
    [
      'more than 10 optional properties',
      {
        type: 'object',
        properties: Object.fromEntries(
          Array.from({ length: 11 }, (_, i) => [`f${i}`, { type: 'string' }]),
        ),
        additionalProperties: false,
      },
    ],
  ] as Array<[string, JSONSchema7]>)(
    'keeps the JSON response tool for a schema with %s',
    async (_, schema) => {
      respondWith([{ type: 'text', text: '{}' }]);

      await createModel('claude-sonnet-5-5').doGenerate(jsonCall(schema));

      const body = await server.calls[0].requestBodyJson;
      expect(body.output_config).toBeUndefined();
      expect(body.tools.map((tool: { name: string }) => tool.name)).toEqual([
        'json',
      ]);
    },
  );

  it('still uses the JSON response tool for models that accept forced tool use', async () => {
    respondWith([
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
