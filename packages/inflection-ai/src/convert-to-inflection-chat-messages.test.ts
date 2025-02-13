import { expect, describe, it } from 'vitest';
import { UnsupportedFunctionalityError } from '@ai-sdk/provider';
import { convertToInflectionChatMessages } from './convert-to-inflection-chat-messages';

describe('convertToInflectionChatMessages', () => {
  it('should convert basic user and assistant messages', () => {
    const result = convertToInflectionChatMessages([
      {
        role: 'user',
        content: [{ type: 'text' as const, text: 'Hello' }],
      },
      {
        role: 'assistant',
        content: [{ type: 'text' as const, text: 'Hi there!' }],
      },
    ]);

    expect(result).toEqual([
      { type: 'Human', text: 'Hello' },
      { type: 'AI', text: 'Hi there!' },
    ]);
  });

  it('should convert system messages to instruction type', () => {
    const result = convertToInflectionChatMessages([
      {
        role: 'system',
        content: 'Be helpful and concise.',
      },
    ]);

    expect(result).toEqual([
      { type: 'Instruction', text: 'Be helpful and concise.' },
    ]);
  });

  it('should combine multiple text parts', () => {
    const result = convertToInflectionChatMessages([
      {
        role: 'user',
        content: [
          { type: 'text' as const, text: 'Hello ' },
          { type: 'text' as const, text: 'world!' },
        ],
      },
    ]);

    expect(result).toEqual([{ type: 'Human', text: 'Hello world!' }]);
  });

  it('should throw error for image content', () => {
    expect(() =>
      convertToInflectionChatMessages([
        {
          role: 'user',
          content: [
            {
              type: 'image',
              image: new Uint8Array([1, 2, 3]),
              mimeType: 'image/jpeg',
            },
          ],
        },
      ]),
    ).toThrow(UnsupportedFunctionalityError);
  });

  it('should throw error for tool results', () => {
    expect(() =>
      convertToInflectionChatMessages([
        {
          role: 'tool',
          content: [
            {
              type: 'tool-result',
              toolCallId: 'tool-call-id-1',
              toolName: 'tool-1',
              result: { key: 'result-value' },
            },
          ],
        },
      ]),
    ).toThrow(UnsupportedFunctionalityError);
  });

  it('should skip empty messages', () => {
    const result = convertToInflectionChatMessages([
      {
        role: 'user',
        content: [{ type: 'text' as const, text: '' }],
      },
    ]);

    expect(result).toEqual([]);
  });
});

describe('tool calls', () => {
  it('should throw error for tool calls', () => {
    expect(() =>
      convertToInflectionChatMessages([
        {
          role: 'assistant',
          content: [
            {
              type: 'tool-call',
              args: { key: 'arg-value' },
              toolCallId: 'tool-call-id-1',
              toolName: 'tool-1',
            },
          ],
        },
      ]),
    ).toThrow(UnsupportedFunctionalityError);
  });
});

describe('assistant messages', () => {
  it('should add prefix true to trailing assistant messages', () => {
    const result = convertToInflectionChatMessages([
      {
        role: 'user',
        content: [{ type: 'text' as const, text: 'Hello' }],
      },
      {
        role: 'assistant',
        content: [{ type: 'text' as const, text: 'Hello!' }],
      },
    ]);

    expect(result).toMatchSnapshot();
  });
});
