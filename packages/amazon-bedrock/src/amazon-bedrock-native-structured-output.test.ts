import type { JSONSchema7, LanguageModelV4CallOptions } from '@ai-sdk/provider';
import { describe, expect, it } from 'vitest';
import { AmazonBedrockChatLanguageModel } from './amazon-bedrock-chat-language-model';

const SCHEMA: JSONSchema7 = {
  type: 'object',
  properties: { answer: { type: 'string' } },
  required: ['answer'],
  additionalProperties: false,
};

async function generate(
  modelId: string,
  schema: JSONSchema7,
  withTools = false,
  options: Partial<LanguageModelV4CallOptions> = {},
  method: 'doGenerate' | 'doStream' = 'doGenerate',
) {
  let body: Record<string, any> = {};
  const model = new AmazonBedrockChatLanguageModel(modelId, {
    baseUrl: () => 'https://bedrock-runtime.us-east-1.amazonaws.com',
    generateId: () => 'test-id',
    fetch: async (_url, init) => {
      body = JSON.parse(String(init?.body));
      if (method === 'doStream') {
        return new Response(new Uint8Array());
      }
      return new Response(
        JSON.stringify({
          output: {
            message: {
              role: 'assistant',
              content: [{ text: '{"answer":"42"}' }],
            },
          },
          usage: { inputTokens: 10, outputTokens: 20, totalTokens: 30 },
          stopReason: 'end_turn',
        }),
        { headers: { 'content-type': 'application/json' } },
      );
    },
  });
  const call: LanguageModelV4CallOptions = {
    prompt: [{ role: 'user', content: [{ type: 'text', text: 'Hello' }] }],
    responseFormat: { type: 'json', schema },
    ...(withTools
      ? { tools: [{ type: 'function', name: 'lookup', inputSchema: SCHEMA }] }
      : {}),
    ...options,
  };
  if (method === 'doStream') {
    const result = await model.doStream(call);
    await result.stream.cancel();
  } else {
    await model.doGenerate(call);
  }
  return body;
}

describe('Claude 5 structured outputs through Converse', () => {
  describe.each(['doGenerate', 'doStream'] as const)(
    '%s fallback tool restrictions',
    method => {
      it.each([
        [{ type: 'none' }, ['json']],
        [{ type: 'tool', toolName: 'lookup' }, ['lookup', 'json']],
        [{ type: 'auto' }, ['lookup', 'unused', 'json']],
        [{ type: 'required' }, ['lookup', 'unused', 'json']],
      ] satisfies Array<
        [NonNullable<LanguageModelV4CallOptions['toolChoice']>, string[]]
      >)(
        'preserves caller tool choice %j',
        async (toolChoice, expectedNames) => {
          const body = await generate(
            'anthropic.claude-opus-5',
            { type: 'object', additionalProperties: true },
            false,
            {
              toolChoice,
              tools: [
                { type: 'function', name: 'lookup', inputSchema: SCHEMA },
                { type: 'function', name: 'unused', inputSchema: SCHEMA },
              ],
            },
            method,
          );
          expect(
            body.additionalModelRequestFields?.output_config,
          ).toBeUndefined();
          expect(
            body.toolConfig.tools.map(
              (tool: { toolSpec: { name: string } }) => tool.toolSpec.name,
            ),
          ).toEqual(expectedNames);
        },
      );
    },
  );

  it.each([
    'anthropic.claude-opus-5',
    'anthropic.claude-opus-5-5',
    'anthropic.claude-sonnet-5',
    'anthropic.claude-sonnet-5-5',
    'anthropic.claude-haiku-5-5',
  ])(
    'uses native output alongside user tools for %s in auto mode',
    async modelId => {
      const body = await generate(modelId, SCHEMA, true);
      expect(body.additionalModelRequestFields?.output_config?.format).toEqual({
        type: 'json_schema',
        schema: SCHEMA,
      });
      expect(body.toolConfig.tools).toEqual([
        expect.objectContaining({
          toolSpec: expect.objectContaining({ name: 'lookup' }),
        }),
      ]);
    },
  );

  describe.each([
    ['an open object', { type: 'object', additionalProperties: true }],
    [
      'a recursive reference',
      {
        type: 'object',
        properties: { child: { $ref: '#' } },
        required: ['child'],
        additionalProperties: false,
      },
    ],
    [
      'too many optional properties',
      {
        type: 'object',
        properties: Object.fromEntries(
          Array.from({ length: 11 }, (_, i) => [`f${i}`, { type: 'string' }]),
        ),
        additionalProperties: false,
      },
    ],
  ] as Array<[string, JSONSchema7]>)('fallback for %s', (_name, schema) => {
    it('preserves the JSON tool on models that accept forced tool use', async () => {
      const body = await generate('anthropic.claude-opus-5', schema);
      expect(body.additionalModelRequestFields?.output_config).toBeUndefined();
      expect(body.toolConfig.toolChoice).toEqual({ any: {} });
      expect(body.toolConfig.tools[0].toolSpec).toMatchObject({
        name: 'json',
        inputSchema: { json: schema },
      });
    });

    it('preserves JSON instructions on models that reject forced tool use', async () => {
      const body = await generate('anthropic.claude-sonnet-5-5', schema);
      expect(body.additionalModelRequestFields?.output_config).toBeUndefined();
      expect(body.toolConfig).toBeUndefined();
      expect(body.system[0].text).toContain(JSON.stringify(schema));
    });
  });
});
