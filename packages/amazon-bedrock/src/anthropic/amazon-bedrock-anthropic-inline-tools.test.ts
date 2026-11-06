import type { LanguageModelV4CallOptions } from '@ai-sdk/provider';
import { describe, expect, it } from 'vitest';
import { createAmazonBedrockAnthropic } from './amazon-bedrock-anthropic-provider';

const CALL: LanguageModelV4CallOptions = {
  prompt: [
    { role: 'user', content: [{ type: 'text', text: 'Say OK.' }] },
    {
      role: 'system',
      content: '',
      providerOptions: {
        anthropic: {
          toolChanges: [
            {
              type: 'tool_addition',
              tool: {
                type: 'function',
                name: 'get_forecast',
                description: 'Get forecast',
                inputSchema: { type: 'object', properties: {} },
                providerOptions: {
                  anthropic: { cacheControl: { type: 'ephemeral' } },
                },
              },
            },
            {
              type: 'tool_addition',
              tool: {
                type: 'function',
                name: 'get_weather',
                description: 'Get weather v2',
                inputSchema: { type: 'object', properties: {} },
              },
            },
          ],
        },
      },
    },
  ],
  tools: [
    {
      type: 'function',
      name: 'get_weather',
      description: 'Get weather',
      inputSchema: { type: 'object', properties: {} },
    },
  ],
};

describe('mid-conversation tool additions by value on Bedrock', () => {
  it('declares them in tools and adds them by reference', async () => {
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
            model: 'us.anthropic.claude-opus-4-8',
            content: [{ type: 'text', text: 'OK' }],
            stop_reason: 'end_turn',
            stop_sequence: null,
            usage: { input_tokens: 10, output_tokens: 2 },
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        );
      },
    });

    await provider('us.anthropic.claude-opus-4-8').doGenerate(CALL);

    expect(body.tools).toEqual([
      {
        name: 'get_weather',
        description: 'Get weather v2',
        input_schema: { type: 'object', properties: {} },
      },
      {
        name: 'get_forecast',
        description: 'Get forecast',
        input_schema: { type: 'object', properties: {} },
        defer_loading: true,
      },
    ]);
    expect(body.messages[1]).toEqual({
      role: 'system',
      content: [
        {
          type: 'tool_addition',
          tool: { type: 'tool_reference', name: 'get_forecast' },
        },
        {
          type: 'tool_addition',
          tool: { type: 'tool_reference', name: 'get_weather' },
        },
      ],
    });
    expect(body.anthropic_beta).toContain(
      'mid-conversation-tool-changes-2026-07-01',
    );
    expect(body.anthropic_beta).not.toContain('inline-tools-2026-09-15');
  });
});
