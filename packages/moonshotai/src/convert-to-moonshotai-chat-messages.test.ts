import { describe, expect, it } from 'vitest';
import { convertToMoonshotAIChatMessages } from './convert-to-moonshotai-chat-messages';

describe('user messages', () => {
  it('should convert a text-only user message to string content', () => {
    const result = convertToMoonshotAIChatMessages([
      { role: 'user', content: [{ type: 'text', text: 'Hello' }] },
    ]);

    expect(result).toEqual([{ role: 'user', content: 'Hello' }]);
  });

  it('should convert image data parts to image_url data URIs', () => {
    const result = convertToMoonshotAIChatMessages([
      {
        role: 'user',
        content: [
          { type: 'text', text: 'Hi' },
          {
            type: 'file',
            data: { type: 'data' as const, data: new Uint8Array([0, 1, 2, 3]) },
            mediaType: 'image/png',
          },
        ],
      },
    ]);

    expect(result).toEqual([
      {
        role: 'user',
        content: [
          { type: 'text', text: 'Hi' },
          {
            type: 'image_url',
            image_url: { url: 'data:image/png;base64,AAECAw==' },
          },
        ],
      },
    ]);
  });

  it('should pass through image URLs', () => {
    const result = convertToMoonshotAIChatMessages([
      {
        role: 'user',
        content: [
          {
            type: 'file',
            data: {
              type: 'url' as const,
              url: new URL('https://example.com/image.jpg'),
            },
            mediaType: 'image/*',
          },
        ],
      },
    ]);

    expect(result).toEqual([
      {
        role: 'user',
        content: [
          {
            type: 'image_url',
            image_url: { url: 'https://example.com/image.jpg' },
          },
        ],
      },
    ]);
  });

  it('should convert video data parts to video_url data URIs', () => {
    const result = convertToMoonshotAIChatMessages([
      {
        role: 'user',
        content: [
          { type: 'text', text: 'Describe this video' },
          {
            type: 'file',
            data: { type: 'data' as const, data: new Uint8Array([0, 1, 2, 3]) },
            mediaType: 'video/mp4',
          },
        ],
      },
    ]);

    expect(result).toEqual([
      {
        role: 'user',
        content: [
          { type: 'text', text: 'Describe this video' },
          {
            type: 'video_url',
            video_url: { url: 'data:video/mp4;base64,AAECAw==' },
          },
        ],
      },
    ]);
  });

  it('should pass through video URLs', () => {
    const result = convertToMoonshotAIChatMessages([
      {
        role: 'user',
        content: [
          {
            type: 'file',
            data: {
              type: 'url' as const,
              url: new URL('https://example.com/video.mp4'),
            },
            mediaType: 'video/*',
          },
        ],
      },
    ]);

    expect(result).toEqual([
      {
        role: 'user',
        content: [
          {
            type: 'video_url',
            video_url: { url: 'https://example.com/video.mp4' },
          },
        ],
      },
    ]);
  });

  it('should decode text/* file parts into text parts', () => {
    const result = convertToMoonshotAIChatMessages([
      {
        role: 'user',
        content: [
          {
            type: 'file',
            data: {
              type: 'data' as const,
              data: Buffer.from('hello markdown').toString('base64'),
            },
            mediaType: 'text/markdown',
          },
        ],
      },
    ]);

    expect(result).toEqual([
      { role: 'user', content: [{ type: 'text', text: 'hello markdown' }] },
    ]);
  });

  it('should throw for audio file parts (rejected by the API)', () => {
    expect(() =>
      convertToMoonshotAIChatMessages([
        {
          role: 'user',
          content: [
            {
              type: 'file',
              data: {
                type: 'data' as const,
                data: new Uint8Array([0, 1, 2, 3]),
              },
              mediaType: 'audio/mp3',
            },
          ],
        },
      ]),
    ).toThrow("'file part media type audio/mp3' functionality not supported");
  });

  it('should throw for PDF file parts (rejected by the API)', () => {
    expect(() =>
      convertToMoonshotAIChatMessages([
        {
          role: 'user',
          content: [
            {
              type: 'file',
              data: {
                type: 'data' as const,
                data: new Uint8Array([0, 1, 2, 3]),
              },
              mediaType: 'application/pdf',
            },
          ],
        },
      ]),
    ).toThrow(
      "'file part media type application/pdf' functionality not supported",
    );
  });

  it('should throw for unsupported file types', () => {
    expect(() =>
      convertToMoonshotAIChatMessages([
        {
          role: 'user',
          content: [
            {
              type: 'file',
              data: {
                type: 'data' as const,
                data: new Uint8Array([0, 1, 2, 3]),
              },
              mediaType: 'application/zip',
            },
          ],
        },
      ]),
    ).toThrow(
      "'file part media type application/zip' functionality not supported",
    );
  });

  it('should throw for file parts with provider references', () => {
    expect(() =>
      convertToMoonshotAIChatMessages([
        {
          role: 'user',
          content: [
            {
              type: 'file',
              data: {
                type: 'reference' as const,
                reference: { moonshotai: 'file-123' },
              },
              mediaType: 'image/png',
            },
          ],
        },
      ]),
    ).toThrow(
      "'file parts with provider references' functionality not supported",
    );
  });

  it('should throw for text file parts', () => {
    expect(() =>
      convertToMoonshotAIChatMessages([
        {
          role: 'user',
          content: [
            {
              type: 'file',
              data: { type: 'text' as const, text: 'hello' },
              mediaType: 'text/plain',
            },
          ],
        },
      ]),
    ).toThrow("'text file parts' functionality not supported");
  });
});

describe('system messages', () => {
  it('should pass system messages through', () => {
    const result = convertToMoonshotAIChatMessages([
      { role: 'system', content: 'You are Kimi.' },
    ]);

    expect(result).toEqual([{ role: 'system', content: 'You are Kimi.' }]);
  });
});

describe('assistant messages', () => {
  it('should emit reasoning_content for reasoning parts', () => {
    const result = convertToMoonshotAIChatMessages([
      {
        role: 'assistant',
        content: [
          { type: 'reasoning', text: 'Let me think.' },
          { type: 'text', text: 'The answer.' },
        ],
      },
    ]);

    expect(result).toEqual([
      {
        role: 'assistant',
        content: 'The answer.',
        reasoning_content: 'Let me think.',
        tool_calls: undefined,
      },
    ]);
  });

  it('should convert tool calls and set content to null when there is no text', () => {
    const result = convertToMoonshotAIChatMessages([
      {
        role: 'assistant',
        content: [
          {
            type: 'tool-call',
            toolCallId: 'call-1',
            toolName: 'get_weather',
            input: { city: 'Paris' },
          },
        ],
      },
    ]);

    expect(result).toEqual([
      {
        role: 'assistant',
        content: null,
        tool_calls: [
          {
            id: 'call-1',
            type: 'function',
            function: { name: 'get_weather', arguments: '{"city":"Paris"}' },
          },
        ],
      },
    ]);
  });

  it('should keep text content when text and tool calls are present', () => {
    const result = convertToMoonshotAIChatMessages([
      {
        role: 'assistant',
        content: [
          { type: 'text', text: 'Checking.' },
          {
            type: 'tool-call',
            toolCallId: 'call-2',
            toolName: 'get_weather',
            input: { city: 'Berlin' },
          },
        ],
      },
    ]);

    expect(result).toEqual([
      {
        role: 'assistant',
        content: 'Checking.',
        tool_calls: [
          {
            id: 'call-2',
            type: 'function',
            function: { name: 'get_weather', arguments: '{"city":"Berlin"}' },
          },
        ],
      },
    ]);
  });
});

describe('tool messages', () => {
  it('should convert text tool results to tool messages', () => {
    const result = convertToMoonshotAIChatMessages([
      {
        role: 'tool',
        content: [
          {
            type: 'tool-result',
            toolCallId: 'call-1',
            toolName: 'get_weather',
            output: { type: 'text', value: 'sunny' },
          },
        ],
      },
    ]);

    expect(result).toEqual([
      { role: 'tool', tool_call_id: 'call-1', content: 'sunny' },
    ]);
  });

  it('should stringify json tool results', () => {
    const result = convertToMoonshotAIChatMessages([
      {
        role: 'tool',
        content: [
          {
            type: 'tool-result',
            toolCallId: 'call-1',
            toolName: 'get_weather',
            output: { type: 'json', value: { temp: 20 } },
          },
        ],
      },
    ]);

    expect(result).toEqual([
      { role: 'tool', tool_call_id: 'call-1', content: '{"temp":20}' },
    ]);
  });
});
