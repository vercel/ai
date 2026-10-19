import type { LanguageModelV4Prompt } from '@ai-sdk/provider';
import { convertReadableStreamToArray } from '@ai-sdk/provider-utils/test';
import {
  WORKFLOW_DESERIALIZE,
  WORKFLOW_SERIALIZE,
} from '@ai-sdk/provider-utils';
import { createTestServer } from '@ai-sdk/test-server/with-vitest';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  minimaxLanguageModelOptions,
  type MiniMaxLanguageModelOptions,
} from './minimax-chat-options';
import { createMiniMax } from './minimax-provider';
import { MiniMaxChatLanguageModel } from './minimax-chat-language-model';

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

  describe('M3.1 Flash top-level reasoning', () => {
    beforeEach(() => {
      server.urls['https://api.minimax.io/anthropic/v1/messages'].response = {
        type: 'json-value',
        body: {
          type: 'message',
          content: [{ type: 'text', text: 'Hello!' }],
          stop_reason: 'end_turn',
          usage: { input_tokens: 4, output_tokens: 10 },
        },
      };
    });

    it.each([
      ['minimal', 'low'],
      ['low', 'low'],
      ['medium', 'medium'],
      ['high', 'high'],
      ['xhigh', 'xhigh'],
      ['max', 'max'],
      ['none', 'low'],
    ] as const)('maps %s to effort %s', async (reasoning, effort) => {
      const result = await provider('minimax-m3.1-flash').doGenerate({
        prompt: TEST_PROMPT,
        reasoning,
        maxOutputTokens: 16384,
        temperature: 1,
        topP: 0.95,
      });

      const body = await server.calls[0].requestBodyJson;
      expect(body).toMatchObject({
        output_config: { effort },
        max_tokens: 16384,
        temperature: 1,
        top_p: 0.95,
      });
      expect(body.thinking).toBeUndefined();
      if (reasoning === 'minimal' || reasoning === 'none') {
        expect(result.warnings).toEqual([
          expect.objectContaining({
            type: 'compatibility',
            feature: 'reasoning',
            details: expect.stringContaining('low'),
          }),
        ]);
      } else {
        expect(result.warnings).toEqual([]);
      }
    });

    it.each([undefined, 'provider-default'] as const)(
      'preserves the server default for %s',
      async reasoning => {
        await provider('minimax-m3.1-flash').doGenerate({
          prompt: TEST_PROMPT,
          reasoning,
          maxOutputTokens: 16384,
        });

        const body = await server.calls[0].requestBodyJson;
        expect(body.output_config).toBeUndefined();
        expect(body.thinking).toBeUndefined();
      },
    );

    it.each(['minimax', 'anthropic'])(
      'preserves explicit %s effort over top-level reasoning',
      async namespace => {
        const result = await provider('minimax-m3.1-flash').doGenerate({
          prompt: TEST_PROMPT,
          reasoning: 'none',
          maxOutputTokens: 16384,
          providerOptions: { [namespace]: { effort: 'max' } },
        });

        const body = await server.calls[0].requestBodyJson;
        expect(body.output_config).toEqual({ effort: 'max' });
        expect(body.thinking).toBeUndefined();
        expect(result.warnings).toEqual([]);
      },
    );

    it('recognizes the canonical mixed-case model ID', async () => {
      await provider('MiniMax-M3.1-Flash').doGenerate({
        prompt: TEST_PROMPT,
        reasoning: 'high',
        maxOutputTokens: 16384,
      });

      expect(await server.calls[0].requestBodyJson).toMatchObject({
        model: 'MiniMax-M3.1-Flash',
        output_config: { effort: 'high' },
      });
    });

    it('preserves MiniMax reasoning handling after workflow serialization', async () => {
      const model = provider('minimax-m3.1-flash') as MiniMaxChatLanguageModel;
      const serialized = MiniMaxChatLanguageModel[WORKFLOW_SERIALIZE](model);
      const restored = MiniMaxChatLanguageModel[WORKFLOW_DESERIALIZE]({
        modelId: serialized.modelId,
        config: {
          ...serialized.config,
          provider: model.provider,
          baseURL: 'https://api.minimax.io/anthropic/v1',
        },
      });

      await restored.doGenerate({
        prompt: TEST_PROMPT,
        reasoning: 'high',
        maxOutputTokens: 16384,
      });

      expect(restored).toBeInstanceOf(MiniMaxChatLanguageModel);
      const body = await server.calls[0].requestBodyJson;
      expect(body.output_config).toEqual({ effort: 'high' });
      expect(body.thinking).toBeUndefined();
    });

    it('does not change reasoning handling for M3', async () => {
      await provider('minimax-m3').doGenerate({
        prompt: TEST_PROMPT,
        reasoning: 'none',
        maxOutputTokens: 16384,
      });

      const body = await server.calls[0].requestBodyJson;
      expect(body.thinking).toEqual({ type: 'disabled' });
      expect(body.output_config).toBeUndefined();
    });

    it('maps reasoning and reports fallback warnings when streaming', async () => {
      server.urls['https://api.minimax.io/anthropic/v1/messages'].response = {
        type: 'stream-chunks',
        chunks: [
          'data: {"type":"message_start","message":{"id":"msg_flash","model":"minimax-m3.1-flash","usage":{"input_tokens":4,"output_tokens":0}}}\n\n',
          'data: {"type":"message_delta","delta":{"stop_reason":"end_turn","stop_sequence":null},"usage":{"output_tokens":0}}\n\n',
          'data: {"type":"message_stop"}\n\n',
        ],
      };

      const result = await provider('minimax-m3.1-flash').doStream({
        prompt: TEST_PROMPT,
        reasoning: 'none',
        maxOutputTokens: 16384,
      });

      const parts = await convertReadableStreamToArray(result.stream);
      const body = await server.calls[0].requestBodyJson;
      expect(body.output_config).toEqual({ effort: 'low' });
      expect(body.thinking).toBeUndefined();
      expect(parts).toContainEqual({
        type: 'stream-start',
        warnings: [
          expect.objectContaining({
            type: 'compatibility',
            feature: 'reasoning',
          }),
        ],
      });
      expect(parts.some(part => part.type === 'error')).toBe(false);
    });
  });

  it.each(['low', 'medium', 'high', 'xhigh', 'max'] as const)(
    'sends M3.1 Flash effort %s through the public MiniMax options',
    async effort => {
      server.urls['https://api.minimax.io/anthropic/v1/messages'].response = {
        type: 'json-value',
        body: {
          id: 'msg_minimax_effort',
          type: 'message',
          role: 'assistant',
          content: [{ type: 'text', text: 'Hello!' }],
          model: 'minimax-m3.1-flash',
          stop_reason: 'end_turn',
          stop_sequence: null,
          usage: { input_tokens: 4, output_tokens: 10 },
        },
      };

      const options = { effort } satisfies MiniMaxLanguageModelOptions;

      await provider('minimax-m3.1-flash').doGenerate({
        prompt: TEST_PROMPT,
        providerOptions: {
          minimax: minimaxLanguageModelOptions.parse(options),
        },
      });

      expect(await server.calls[0].requestBodyJson).toMatchObject({
        model: 'minimax-m3.1-flash',
        output_config: { effort },
      });
    },
  );

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
