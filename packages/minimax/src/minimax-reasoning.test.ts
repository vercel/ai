import type { LanguageModelV4Prompt } from '@ai-sdk/provider';
import { createTestServer } from '@ai-sdk/test-server/with-vitest';
import { describe, expect, it } from 'vitest';
import { createMiniMax } from './minimax-provider';

// MiniMax-specific behavior: the provider delegates to the Anthropic message
// protocol, so `thinking` must flow through the `minimax` provider-options
// namespace to the request, and the response `thinking` block must surface as
// an AI SDK reasoning part

const TEST_PROMPT: LanguageModelV4Prompt = [
  { role: 'user', content: [{ type: 'text', text: 'Hello' }] },
];

const provider = createMiniMax({ apiKey: 'test-api-key' });

describe('MiniMax reasoning', () => {
  const server = createTestServer({
    'https://api.minimax.io/anthropic/v1/messages': {},
  });

  it('sends thinking via the minimax provider option and returns a reasoning part', async () => {
    server.urls['https://api.minimax.io/anthropic/v1/messages'].response = {
      type: 'json-value',
      body: {
        id: 'msg_minimax_reasoning',
        type: 'message',
        role: 'assistant',
        content: [
          {
            type: 'thinking',
            thinking: 'Counting the letters...',
            signature: 'sig_123',
          },
          { type: 'text', text: 'There are 3 "r"s.' },
        ],
        model: 'minimax-m3',
        stop_reason: 'end_turn',
        stop_sequence: null,
        usage: { input_tokens: 4, output_tokens: 30 },
      },
    };

    const result = await provider('minimax-m3').doGenerate({
      prompt: TEST_PROMPT,
      providerOptions: {
        minimax: {
          thinking: { type: 'adaptive' },
        },
      },
    });

    // The thinking option flows to the request under the Anthropic contract.
    expect(await server.calls[0].requestBodyJson).toMatchObject({
      model: 'minimax-m3',
      thinking: { type: 'adaptive' },
    });

    // The thinking block surfaces as a reasoning part, ahead of the text part.
    expect(result.content).toEqual([
      expect.objectContaining({
        type: 'reasoning',
        text: 'Counting the letters...',
      }),
      expect.objectContaining({ type: 'text', text: 'There are 3 "r"s.' }),
    ]);
  });
});
