import type { LanguageModelV4CallOptions } from '@ai-sdk/provider';
import { describe, expect, it } from 'vitest';
import { createGoogleVertexAnthropic } from './google-vertex-anthropic-provider';

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

async function generate(modelId: string) {
  let body: Record<string, any> = {};
  const provider = createGoogleVertexAnthropic({
    project: 'test-project',
    location: 'global',
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

  const result = await provider(modelId).doGenerate(CALL);
  return { body, result };
}

describe('structured outputs for Claude models that reject forced tool use', () => {
  it.each(['claude-sonnet-5-5', 'claude-opus-5-5', 'claude-fable-5-1'])(
    'sends output_config.format for %s',
    async modelId => {
      const { body, result } = await generate(modelId);

      expect(body.output_config).toEqual({
        format: { type: 'json_schema', schema: SCHEMA },
      });
      expect(body.tools).toBeUndefined();
      expect(result.content).toEqual([
        { type: 'text', text: '{"answer":"42"}' },
      ]);
    },
  );

  it('keeps the json tool for models that accept forced tool use', async () => {
    const { body } = await generate('claude-haiku-5-5');

    expect(body.output_config).toBeUndefined();
    expect(body.tool_choice).toMatchObject({ type: 'any' });
  });
});
