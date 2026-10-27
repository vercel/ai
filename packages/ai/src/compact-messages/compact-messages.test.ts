import type { ModelMessage } from '@ai-sdk/provider-utils';
import { describe, expect, it, vi } from 'vitest';
import { createNullLanguageModelUsage } from '../types/usage';
import { compactMessages } from './compact-messages';

const summarize = {
  maxOutputTokens: 100,
  execute: async () => ({
    text: 'Completed earlier work.',
    finishReason: 'stop' as const,
  }),
};

// Synthetic units exercise allocation; this is not a model tokenizer.
const countTokens = (messages: readonly ModelMessage[]) =>
  messages.reduce(
    (total, message) =>
      total +
      (typeof message.content === 'string'
        ? message.content.length
        : message.content.reduce(
            (size, part) => size + ('text' in part ? part.text.length : 0),
            0,
          )),
    0,
  );

describe('compactMessages', () => {
  it.each(['count', 'tokens'] as const)(
    'summarizes old native history while retaining the recent exchange (%s)',
    async mode => {
      const exchange = (id: string, payload: string): ModelMessage[] => [
        {
          role: 'assistant',
          content: [
            {
              type: 'tool-call',
              toolCallId: id,
              toolName: 'search',
              input: {},
              providerExecuted: true,
            },
          ],
        },
        {
          role: 'assistant',
          content: [
            {
              type: 'custom',
              kind: 'test.native',
              providerOptions: { test: { payload } },
            },
            {
              type: 'tool-result',
              toolCallId: id,
              toolName: 'search',
              output: { type: 'text', value: `Readable evidence from ${id}` },
            },
          ],
        },
      ];
      const recent = exchange('recent', 'retained-state');
      const messages: ModelMessage[] = [
        { role: 'user', content: 'Compare the search results.' },
        ...exchange('old', 'secret-state'.repeat(300)),
        ...recent,
      ];
      const counter = (input: readonly ModelMessage[]) =>
        JSON.stringify(input).length;
      const execute = vi.fn(async (input: { messages: ModelMessage[] }) => {
        const transcript = JSON.stringify(input.messages);
        expect(transcript).toContain('Readable evidence from old');
        expect(transcript).not.toContain('secret-state');
        return summarize.execute();
      });
      const options = {
        strategy: 'summarize' as const,
        messages,
        keepRecentMessages: 1,
        summarize: { ...summarize, execute },
      };
      const result = await compactMessages(
        mode === 'tokens'
          ? {
              ...options,
              context: { inputTokens: counter(messages), fixedInputTokens: 0 },
              targetInputTokens: 2_000,
              countTokens: counter,
            }
          : options,
      );
      expect(execute).toHaveBeenCalledOnce();
      expect(result.messages).toHaveLength(4);
      expect(result.messages.slice(-2)).toEqual(recent);
      expect(result.messages[1]).toEqual(messages[0]);
      expect(result.checkpoint).toBeDefined();
      if (mode === 'tokens')
        expect(result.inputTokensAfter).toBeLessThanOrEqual(2_000);
    },
  );

  it.each([true, false])(
    'honors current-turn retention (%s) without dropping pending calls',
    async keepCurrentTurn => {
      const native: ModelMessage = {
        role: 'assistant',
        content: [{ type: 'custom', kind: 'test.native' }],
      };
      const pending: ModelMessage = {
        role: 'assistant',
        content: [
          {
            type: 'tool-call',
            toolCallId: 'pending',
            toolName: 'read',
            input: {},
          },
        ],
      };
      const result = await compactMessages({
        strategy: 'summarize',
        messages: [
          { role: 'user', content: 'Continue working.' },
          native,
          pending,
        ],
        keepRecentMessages: 0,
        keepCurrentTurn,
        summarize,
      });
      expect(result.messages).toContainEqual(pending);
      expect(result.messages.includes(native)).toBe(keepCurrentTurn);
    },
  );

  it('rejects a custom strategy that removes an unresolved tool call', async () => {
    await expect(
      compactMessages({
        messages: [
          { role: 'user', content: 'Read a file.' },
          {
            role: 'assistant',
            content: [
              {
                type: 'tool-call',
                toolCallId: 'pending',
                toolName: 'read',
                input: {},
              },
            ],
          },
        ],
        strategy: async () => ({ messages: [] }),
      }),
    ).rejects.toMatchObject({ code: 'INVALID_MESSAGES' });
  });

  it('compacts completed work within a turn while preserving the recent reasoning/tool exchange', async () => {
    const exchange = (id: string): ModelMessage[] => [
      {
        role: 'assistant',
        content: [
          {
            type: 'reasoning',
            text: 'Private scratch work.',
            providerOptions: {
              openai: { reasoningEncryptedContent: `encrypted-${id}` },
            },
          },
          { type: 'tool-call', toolCallId: id, toolName: 'lookup', input: {} },
        ],
      },
      {
        role: 'tool',
        content: [
          {
            type: 'tool-result',
            toolCallId: id,
            toolName: 'lookup',
            output: { type: 'text', value: `Result ${id}` },
          },
        ],
      },
    ];
    const messages: ModelMessage[] = [
      {
        role: 'user',
        content: 'Perform two lookups.',
        providerOptions: { app: { redacted: false } },
      },
      ...exchange('first'),
      ...exchange('second'),
    ];
    const original = structuredClone(messages);
    const execute = vi.fn(async (input: { messages: ModelMessage[] }) => {
      expect(JSON.stringify(input.messages)).not.toContain(
        'Private scratch work.',
      );
      expect(JSON.stringify(input.messages)).not.toContain('encrypted-first');
      return summarize.execute();
    });
    const result = await compactMessages({
      strategy: 'summarize',
      messages,
      keepRecentMessages: 2,
      summarize: { ...summarize, execute },
    });
    expect(execute).toHaveBeenCalledOnce();
    expect(result.compacted).toBe(true);
    expect(result.messages).toHaveLength(4);
    expect(result.messages.slice(-2)).toEqual(messages.slice(-2));
    expect(result.messages[1]).toEqual(messages[0]);
    expect(messages).toEqual(original);
  });

  it('shortens an oversized summary before evicting recent context', async () => {
    const messages: ModelMessage[] = [
      { role: 'user', content: 'Earlier task' },
      { role: 'assistant', content: 'Recent evidence.'.repeat(5) },
      { role: 'user', content: 'Use that evidence for the current request.' },
    ];
    const result = await compactMessages({
      strategy: 'summarize',
      messages,
      reason: 'manual',
      keepRecentMessages: 2,
      context: { inputTokens: countTokens(messages), fixedInputTokens: 0 },
      countTokens,
      targetInputTokens: 500,
      summarize: {
        ...summarize,
        execute: async () => ({
          text: 'Long summary. '.repeat(100),
          finishReason: 'stop',
        }),
      },
    });
    expect(result.messages.slice(-2)).toEqual(messages.slice(-2));
    expect(result.inputTokensAfter).toBeLessThanOrEqual(500);
  });

  it('accepts a summary without a finish reason', async () => {
    const result = await compactMessages({
      strategy: 'summarize',
      messages: [
        { role: 'user', content: 'Earlier task' },
        { role: 'assistant', content: 'Earlier answer' },
        { role: 'user', content: 'Continue' },
      ],
      keepRecentMessages: 0,
      summarize: {
        maxOutputTokens: 100,
        execute: async () => ({ text: 'Completed earlier work.' }),
      },
    });
    expect(result.compacted).toBe(true);
    expect(result.messages[0].content).toContain('Completed earlier work.');
    expect(result.checkpoint).toBeDefined();
  });

  it('rejects a truncated summary while exposing its billed usage', async () => {
    const usage = { ...createNullLanguageModelUsage(), outputTokens: 100 };
    const onUsage = vi.fn();
    await expect(
      compactMessages({
        strategy: 'summarize',
        messages: [
          { role: 'user', content: 'Earlier task' },
          { role: 'assistant', content: 'Earlier answer' },
          { role: 'user', content: 'Continue' },
        ],
        keepRecentMessages: 0,
        onUsage,
        summarize: {
          ...summarize,
          execute: async () => ({
            text: 'Unfinished summary because',
            finishReason: 'length',
            usage,
          }),
        },
      }),
    ).rejects.toMatchObject({
      code: 'SUMMARY_INCOMPLETE',
      usage: { outputTokens: 100 },
    });
    expect(onUsage).toHaveBeenCalledWith(usage);
  });

  it('removes empty text parts when clipping a multipart request', async () => {
    const messages: ModelMessage[] = [
      {
        role: 'user',
        content: Array.from({ length: 5 }, (_, i) => ({
          type: 'text' as const,
          text: String(i).repeat(100),
        })),
      },
    ];
    const result = await compactMessages({
      strategy: 'summarize',
      messages,
      context: { inputTokens: countTokens(messages), fixedInputTokens: 0 },
      countTokens,
      targetInputTokens: 200,
      summarize,
    });
    const content = result.messages.at(-1)!.content;
    expect(Array.isArray(content)).toBe(true);
    if (Array.isArray(content)) {
      expect(
        content.every(part => part.type !== 'text' || part.text.length > 0),
      ).toBe(true);
    }
    expect(result.inputTokensAfter).toBeLessThanOrEqual(200);
  });
});
