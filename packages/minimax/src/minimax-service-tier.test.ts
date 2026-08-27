import type { LanguageModelV4Prompt } from '@ai-sdk/provider';
import { createTestServer } from '@ai-sdk/test-server/with-vitest';
import { describe, expect, it } from 'vitest';
import { createMiniMax } from './minimax-provider';

// MiniMax's Anthropic-compatible endpoint accepts `service_tier`
// ('standard' | 'priority'); the provider delegates to the Anthropic message
// protocol, so the option flows through the `minimax` provider-options
// namespace to the request body.

const TEST_PROMPT: LanguageModelV4Prompt = [
  { role: 'user', content: [{ type: 'text', text: 'Hello' }] },
];

const provider = createMiniMax({ apiKey: 'test-api-key' });

describe('MiniMax service tier', () => {
  const server = createTestServer({
    'https://api.minimax.io/anthropic/v1/messages': {},
  });

  it('sends serviceTier via the minimax provider option as service_tier', async () => {
    server.urls['https://api.minimax.io/anthropic/v1/messages'].response = {
      type: 'json-value',
      body: {
        id: 'msg_minimax_service_tier',
        type: 'message',
        role: 'assistant',
        content: [{ type: 'text', text: 'Hello!' }],
        model: 'minimax-m3',
        stop_reason: 'end_turn',
        stop_sequence: null,
        usage: { input_tokens: 4, output_tokens: 10 },
      },
    };

    await provider('minimax-m3').doGenerate({
      prompt: TEST_PROMPT,
      providerOptions: {
        minimax: {
          serviceTier: 'priority',
        },
      },
    });

    expect(await server.calls[0].requestBodyJson).toMatchObject({
      model: 'minimax-m3',
      service_tier: 'priority',
    });
  });

  it('warns and omits Anthropic-only serviceTier values on MiniMax', async () => {
    server.urls['https://api.minimax.io/anthropic/v1/messages'].response = {
      type: 'json-value',
      body: {
        id: 'msg_minimax_service_tier_warn',
        type: 'message',
        role: 'assistant',
        content: [{ type: 'text', text: 'Hello!' }],
        model: 'minimax-m3',
        stop_reason: 'end_turn',
        stop_sequence: null,
        usage: { input_tokens: 4, output_tokens: 10 },
      },
    };

    const result = await provider('minimax-m3').doGenerate({
      prompt: TEST_PROMPT,
      providerOptions: {
        anthropic: {
          serviceTier: 'auto',
        },
      },
    });

    expect(await server.calls[0].requestBodyJson).not.toHaveProperty(
      'service_tier',
    );
    expect(result.warnings).toContainEqual({
      type: 'unsupported',
      feature: 'serviceTier',
      details:
        'serviceTier "auto" is not supported by MiniMax. Use "standard" or "priority".',
    });
  });
});
