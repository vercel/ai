import type { JSONSchema7, LanguageModelV2CallOptions } from '@ai-sdk/provider';
import { describe, expect, it } from 'vitest';
import { AnthropicMessagesLanguageModel } from './anthropic-messages-language-model';

const closed: JSONSchema7 = {
  type: 'object',
  properties: { answer: { type: 'string' } },
  required: ['answer'],
  additionalProperties: false,
};
const open: JSONSchema7 = { type: 'object', additionalProperties: true };

async function request(
  modelId: string,
  schema: JSONSchema7,
  options: Partial<LanguageModelV2CallOptions> = {},
  method: 'doGenerate' | 'doStream' = 'doGenerate',
) {
  let body: Record<string, any> = {};
  const model = new AnthropicMessagesLanguageModel(modelId, {
    provider: 'anthropic.messages',
    baseURL: 'https://api.anthropic.com/v1',
    headers: {},
    fetch: async (_url, init) => {
      body = JSON.parse(String(init?.body));
      return method === 'doStream'
        ? new Response('')
        : Response.json({
            id: 'msg_1',
            type: 'message',
            role: 'assistant',
            model: modelId,
            content: [{ type: 'text', text: '{}' }],
            stop_reason: 'end_turn',
            stop_sequence: null,
            usage: { input_tokens: 1, output_tokens: 1 },
          });
    },
  });
  const result = await model[method]({
    prompt: [{ role: 'user', content: [{ type: 'text', text: 'Hello' }] }],
    responseFormat: { type: 'json', schema },
    providerOptions: { anthropic: { structuredOutputMode: 'auto' } },
    ...options,
  });
  if ('stream' in result) await result.stream.cancel();
  return body;
}

describe.each(['doGenerate', 'doStream'] as const)(
  '%s structured output fallback',
  method => {
    it.each(['claude-sonnet-4-5', 'claude-sonnet-5-5'])(
      'keeps open schemas intact for %s',
      async modelId => {
        const body = await request(modelId, open, {}, method);
        expect(body.output_config).toBeUndefined();
        expect(body.tools).toEqual([
          expect.objectContaining({ name: 'json', input_schema: open }),
        ]);
        expect(body.tool_choice.type).toBe(
          modelId === 'claude-sonnet-5-5' ? 'auto' : 'tool',
        );
      },
    );
    it('uses native output for a closed schema', async () => {
      const body = await request('claude-sonnet-5-5', closed, {}, method);
      expect(body.output_config.format).toEqual({
        type: 'json_schema',
        schema: closed,
      });
      expect(body.tools).toBeUndefined();
    });
    it('preserves top-level ref definitions with the JSON fallback', async () => {
      const schema: JSONSchema7 = {
        $ref: '#/definitions/Answer',
        definitions: { Answer: closed },
      };
      const body = await request('claude-sonnet-5-5', schema, {}, method);
      expect(body.output_config).toBeUndefined();
      expect(body.tools[0].input_schema).toEqual(schema);
    });
    describe.each(['claude-sonnet-4-5', 'claude-sonnet-5-5'])(
      '%s caller restrictions',
      modelId => {
        it.each([
          [{ type: 'none' }, ['json']],
          [{ type: 'tool', toolName: 'lookup' }, ['lookup', 'json']],
          [{ type: 'auto' }, ['lookup', 'unused', 'web_search', 'json']],
          [{ type: 'required' }, ['lookup', 'unused', 'web_search', 'json']],
        ] satisfies Array<
          [NonNullable<LanguageModelV2CallOptions['toolChoice']>, string[]]
        >)('preserves %j', async (toolChoice, expected) => {
          const body = await request(
            modelId,
            open,
            {
              toolChoice,
              tools: [
                { type: 'function', name: 'lookup', inputSchema: closed },
                { type: 'function', name: 'unused', inputSchema: closed },
                {
                  type: 'provider-defined',
                  id: 'anthropic.web_search_20250305',
                  name: 'web_search',
                  args: {},
                },
              ],
            },
            method,
          );
          expect(body.output_config).toBeUndefined();
          expect(body.tools.map((tool: { name: string }) => tool.name)).toEqual(
            expected,
          );
        });
      },
    );
  },
);
