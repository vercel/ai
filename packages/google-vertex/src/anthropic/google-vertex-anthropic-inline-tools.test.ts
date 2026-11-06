import type { LanguageModelV4CallOptions } from '@ai-sdk/provider';
import { describe, expect, it } from 'vitest';
import { createGoogleVertexAnthropic } from './google-vertex-anthropic-provider';

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
              },
            },
            {
              type: 'tool_addition',
              tool: {
                type: 'provider',
                id: 'anthropic.web_search_20250305',
                name: 'web_search',
                args: { maxUses: 1 },
              },
            },
          ],
        },
      },
    },
  ],
};

describe('mid-conversation tool additions by value on Vertex', () => {
  it('declares them in tools and adds them by reference', async () => {
    let body: Record<string, any> = {};
    let headers = new Headers();
    const provider = createGoogleVertexAnthropic({
      project: 'test-project',
      location: 'us-east5',
      fetch: async (_url, init) => {
        body = JSON.parse(String(init?.body));
        headers = new Headers(init?.headers);
        return new Response(
          JSON.stringify({
            id: 'msg_1',
            type: 'message',
            role: 'assistant',
            model: 'claude-opus-4-8',
            content: [{ type: 'text', text: 'OK' }],
            stop_reason: 'end_turn',
            stop_sequence: null,
            usage: { input_tokens: 10, output_tokens: 2 },
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        );
      },
    });

    await provider('claude-opus-4-8').doGenerate(CALL);

    expect(body.tools).toEqual([
      {
        name: 'get_forecast',
        description: 'Get forecast',
        input_schema: { type: 'object', properties: {} },
        defer_loading: true,
      },
      { type: 'web_search_20250305', name: 'web_search', max_uses: 1 },
    ]);
    expect(body.messages[1].content).toEqual([
      {
        type: 'tool_addition',
        tool: { type: 'tool_reference', name: 'get_forecast' },
      },
      {
        type: 'tool_addition',
        tool: { type: 'tool_reference', name: 'web_search' },
      },
    ]);
    const betas = headers.get('anthropic-beta') ?? '';
    expect(betas).toContain('mid-conversation-tool-changes-2026-07-01');
    expect(betas).not.toContain('inline-tools-2026-09-15');
  });
});
