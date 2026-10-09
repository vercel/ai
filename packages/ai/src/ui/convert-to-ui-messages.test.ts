import type { ModelMessage } from '@ai-sdk/provider-utils';
import { describe, expect, it } from 'vitest';
import { convertToUIMessages } from './convert-to-ui-messages';

// Deterministic id generator for snapshot stability.
const ids = () => {
  let i = 0;
  return () => `msg-${++i}`;
};

describe('convertToUIMessages', () => {
  describe('system message', () => {
    it('should convert a system message with string content', () => {
      const result = convertToUIMessages(
        [{ role: 'system', content: 'You are helpful.' }],
        { generateId: ids() },
      );

      expect(result).toEqual([
        {
          id: 'msg-1',
          role: 'system',
          parts: [{ type: 'text', text: 'You are helpful.' }],
        },
      ]);
    });

    it('should join text parts when system content is an array', () => {
      const result = convertToUIMessages(
        [
          {
            role: 'system',
            content: [
              { type: 'text', text: 'You are ' },
              { type: 'text', text: 'helpful.' },
            ],
          } as ModelMessage,
        ],
        { generateId: ids() },
      );

      expect(result[0].parts).toEqual([
        { type: 'text', text: 'You are helpful.' },
      ]);
    });
  });

  describe('user message', () => {
    it('should convert a user message with string content', () => {
      const result = convertToUIMessages(
        [{ role: 'user', content: 'Hello' }],
        { generateId: ids() },
      );

      expect(result).toEqual([
        {
          id: 'msg-1',
          role: 'user',
          parts: [{ type: 'text', text: 'Hello' }],
        },
      ]);
    });

    it('should convert a user message with text and file URL parts', () => {
      const result = convertToUIMessages(
        [
          {
            role: 'user',
            content: [
              { type: 'text', text: 'Look at this' },
              {
                type: 'file',
                mediaType: 'image/png',
                data: {
                  type: 'url',
                  url: new URL('https://example.com/x.png'),
                },
              },
            ],
          } as ModelMessage,
        ],
        { generateId: ids() },
      );

      expect(result[0].parts).toEqual([
        { type: 'text', text: 'Look at this' },
        {
          type: 'file',
          mediaType: 'image/png',
          url: 'https://example.com/x.png',
        },
      ]);
    });

    it('should preserve provider options as providerMetadata on text parts', () => {
      const result = convertToUIMessages(
        [
          {
            role: 'user',
            content: [
              {
                type: 'text',
                text: 'Hi',
                providerOptions: { acme: { cacheControl: 'ephemeral' } },
              },
            ],
          } as ModelMessage,
        ],
        { generateId: ids() },
      );

      expect(result[0].parts[0]).toEqual({
        type: 'text',
        text: 'Hi',
        providerMetadata: { acme: { cacheControl: 'ephemeral' } },
      });
    });
  });

  describe('assistant message', () => {
    it('should convert a simple assistant text response', () => {
      const result = convertToUIMessages(
        [{ role: 'assistant', content: 'Hello there!' }],
        { generateId: ids() },
      );

      expect(result).toEqual([
        {
          id: 'msg-1',
          role: 'assistant',
          parts: [{ type: 'text', text: 'Hello there!', state: 'done' }],
        },
      ]);
    });

    it('should convert reasoning and text parts in order', () => {
      const result = convertToUIMessages(
        [
          {
            role: 'assistant',
            content: [
              { type: 'reasoning', text: 'Let me think.' },
              { type: 'text', text: 'The answer is 42.' },
            ],
          } as ModelMessage,
        ],
        { generateId: ids() },
      );

      expect(result[0].parts).toEqual([
        { type: 'reasoning', text: 'Let me think.', state: 'done' },
        { type: 'text', text: 'The answer is 42.', state: 'done' },
      ]);
    });

    it('should emit tool-call parts in input-available state when no tool result follows', () => {
      const result = convertToUIMessages(
        [
          {
            role: 'assistant',
            content: [
              {
                type: 'tool-call',
                toolCallId: 'call-1',
                toolName: 'getWeather',
                input: { city: 'Lahore' },
              },
            ],
          } as ModelMessage,
        ],
        { generateId: ids() },
      );

      expect(result[0].parts).toEqual([
        {
          type: 'tool-getWeather',
          toolCallId: 'call-1',
          state: 'input-available',
          input: { city: 'Lahore' },
        },
      ]);
    });
  });

  describe('assistant + tool turn', () => {
    it('should merge a tool-result into the preceding assistant tool-call', () => {
      const result = convertToUIMessages(
        [
          {
            role: 'assistant',
            content: [
              {
                type: 'tool-call',
                toolCallId: 'call-1',
                toolName: 'getWeather',
                input: { city: 'Lahore' },
              },
            ],
          } as ModelMessage,
          {
            role: 'tool',
            content: [
              {
                type: 'tool-result',
                toolCallId: 'call-1',
                toolName: 'getWeather',
                output: { type: 'json', value: { temperature: 32 } },
              },
            ],
          } as ModelMessage,
        ],
        { generateId: ids() },
      );

      // Only one UI message — the tool message is merged in.
      expect(result).toHaveLength(1);
      expect(result[0].parts).toEqual([
        {
          type: 'tool-getWeather',
          toolCallId: 'call-1',
          state: 'output-available',
          input: { city: 'Lahore' },
          output: { temperature: 32 },
        },
      ]);
    });

    it('should map error-text tool output to output-error state', () => {
      const result = convertToUIMessages(
        [
          {
            role: 'assistant',
            content: [
              {
                type: 'tool-call',
                toolCallId: 'call-1',
                toolName: 'flaky',
                input: {},
              },
            ],
          } as ModelMessage,
          {
            role: 'tool',
            content: [
              {
                type: 'tool-result',
                toolCallId: 'call-1',
                toolName: 'flaky',
                output: { type: 'error-text', value: 'rate limited' },
              },
            ],
          } as ModelMessage,
        ],
        { generateId: ids() },
      );

      expect(result[0].parts[0]).toMatchObject({
        type: 'tool-flaky',
        state: 'output-error',
        errorText: 'rate limited',
      });
    });

    it('should map execution-denied output to output-denied state with reason', () => {
      const result = convertToUIMessages(
        [
          {
            role: 'assistant',
            content: [
              {
                type: 'tool-call',
                toolCallId: 'call-1',
                toolName: 'sendEmail',
                input: { to: 'x@y.z' },
              },
            ],
          } as ModelMessage,
          {
            role: 'tool',
            content: [
              {
                type: 'tool-result',
                toolCallId: 'call-1',
                toolName: 'sendEmail',
                output: {
                  type: 'execution-denied',
                  reason: 'user rejected',
                },
              },
            ],
          } as ModelMessage,
        ],
        { generateId: ids() },
      );

      expect(result[0].parts[0]).toMatchObject({
        type: 'tool-sendEmail',
        state: 'output-denied',
        approval: { approved: false, reason: 'user rejected' },
      });
    });

    it('should preserve a tool-call when the matching tool message is missing', () => {
      const result = convertToUIMessages(
        [
          {
            role: 'assistant',
            content: [
              {
                type: 'tool-call',
                toolCallId: 'call-1',
                toolName: 'orphaned',
                input: {},
              },
            ],
          } as ModelMessage,
        ],
        { generateId: ids() },
      );

      expect(result[0].parts[0]).toMatchObject({
        type: 'tool-orphaned',
        state: 'input-available',
      });
    });
  });

  describe('round trip', () => {
    it('should generate sequential ids for each model message', () => {
      const result = convertToUIMessages(
        [
          { role: 'system', content: 'sys' },
          { role: 'user', content: 'hi' },
          { role: 'assistant', content: 'hello' },
        ],
        { generateId: ids() },
      );

      expect(result.map(m => m.id)).toEqual(['msg-1', 'msg-2', 'msg-3']);
    });

    it('should throw when a tool message has no preceding assistant', () => {
      expect(() =>
        convertToUIMessages(
          [
            {
              role: 'tool',
              content: [
                {
                  type: 'tool-result',
                  toolCallId: 'call-1',
                  toolName: 'x',
                  output: { type: 'text', value: 'oops' },
                },
              ],
            } as ModelMessage,
          ],
          { generateId: ids() },
        ),
      ).toThrow(/preceding assistant/);
    });
  });
});
