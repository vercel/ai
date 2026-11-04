import type { JSONSchema7, LanguageModelV4CallOptions } from '@ai-sdk/provider';
import { describe, expect, it } from 'vitest';
import { createAmazonBedrockAnthropic } from './amazon-bedrock-anthropic-provider';

const SCHEMA = {
  type: 'object' as const,
  properties: { answer: { type: 'string' as const } },
  required: ['answer'],
  additionalProperties: false,
};

const CALL: LanguageModelV4CallOptions = {
  prompt: [{ role: 'user', content: [{ type: 'text', text: 'Hello' }] }],
  responseFormat: { type: 'json', schema: SCHEMA },
};

async function generate(
  modelId: string,
  call: LanguageModelV4CallOptions = CALL,
) {
  let body: Record<string, any> = {};
  const provider = createAmazonBedrockAnthropic({
    region: 'us-east-1',
    apiKey: 'test-api-key',
    fetch: async (_url, init) => {
      body = JSON.parse(String(init?.body));
      return new Response(
        JSON.stringify({
          id: 'msg_1',
          type: 'message',
          role: 'assistant',
          model: modelId,
          content: [{ type: 'text', text: '{"answer":"42"}' }],
          stop_reason: 'end_turn',
          stop_sequence: null,
          usage: { input_tokens: 10, output_tokens: 20 },
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      );
    },
  });

  const result = await provider(modelId).doGenerate(call);
  return { body, result };
}

describe('Claude 5 structured outputs through InvokeModel', () => {
  it.each([
    [{ type: 'none' }, ['json']],
    [{ type: 'tool', toolName: 'lookup' }, ['lookup', 'json']],
  ] satisfies Array<
    [NonNullable<LanguageModelV4CallOptions['toolChoice']>, string[]]
  >)(
    'preserves caller tool choice %j during schema fallback',
    async (toolChoice, expectedNames) => {
      const { body } = await generate('us.anthropic.claude-sonnet-5-5', {
        ...CALL,
        responseFormat: {
          type: 'json',
          schema: { type: 'object', additionalProperties: true },
        },
        toolChoice,
        tools: [
          { type: 'function', name: 'lookup', inputSchema: SCHEMA },
          { type: 'function', name: 'unused', inputSchema: SCHEMA },
        ],
      });
      expect(body.output_config).toBeUndefined();
      expect(body.tools.map((tool: { name: string }) => tool.name)).toEqual(
        expectedNames,
      );
    },
  );

  it.each([
    'global.anthropic.claude-sonnet-5-5',
    'us.anthropic.claude-opus-5-5',
    'anthropic.claude-fable-5-1',
    'us.anthropic.claude-haiku-5-5',
    'us.anthropic.claude-sonnet-5',
    'us.anthropic.claude-opus-5',
  ])('sends output_config.format for %s', async modelId => {
    const { body, result } = await generate(modelId);

    expect(body.output_config).toEqual({
      format: { type: 'json_schema', schema: SCHEMA },
    });
    expect(body.tools).toBeUndefined();
    expect(result.content).toEqual([{ type: 'text', text: '{"answer":"42"}' }]);
  });

  it('keeps the json tool when explicitly requested on a model that accepts forced tool use', async () => {
    const { body } = await generate('us.anthropic.claude-haiku-5-5', {
      ...CALL,
      providerOptions: { anthropic: { structuredOutputMode: 'jsonTool' } },
    });

    expect(body.output_config).toBeUndefined();
    expect(body.tool_choice).toEqual({ type: 'any' });
  });

  it.each([
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
  ] as Array<[string, JSONSchema7]>)(
    'preserves the JSON tool fallback for %s on the native-capable path',
    async (_name, schema) => {
      const { body } = await generate('us.anthropic.claude-sonnet-5-5', {
        ...CALL,
        responseFormat: { type: 'json', schema },
      });

      expect(body.output_config).toBeUndefined();
      expect(body.tools).toEqual([
        expect.objectContaining({ name: 'json', input_schema: schema }),
      ]);
      expect(body.tool_choice).toEqual({ type: 'auto' });
    },
  );

  it('preserves strict tool definitions through InvokeModel', async () => {
    const { body } = await generate('us.anthropic.claude-haiku-5-5', {
      prompt: CALL.prompt,
      tools: [
        {
          type: 'function',
          name: 'answer',
          inputSchema: SCHEMA,
          strict: true,
        },
      ],
    });

    expect(body.tools).toEqual([
      expect.objectContaining({ name: 'answer', strict: true }),
    ]);
  });
});
