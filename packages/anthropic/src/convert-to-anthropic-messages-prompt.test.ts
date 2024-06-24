import { convertToAnthropicMessagesPrompt } from './convert-to-anthropic-messages-prompt';

describe('user messages', () => {
  it('should download images for user image parts with URLs', async () => {
    const result = await convertToAnthropicMessagesPrompt({
      prompt: [
        {
          role: 'user',
          content: [
            {
              type: 'image',
              image: new URL('https://example.com/image.png'),
            },
          ],
        },
      ],
      downloadImplementation: async ({ url }) => {
        expect(url).toEqual(new URL('https://example.com/image.png'));

        return {
          data: new Uint8Array([0, 1, 2, 3]),
          mimeType: 'image/png',
        };
      },
    });

    expect(result).toEqual({
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'image',
              source: {
                data: 'AAECAw==',
                media_type: 'image/png',
                type: 'base64',
              },
            },
          ],
        },
      ],
      system: undefined,
    });
  });

  it('should add image parts for UInt8Array images', async () => {
    const result = await convertToAnthropicMessagesPrompt({
      prompt: [
        {
          role: 'user',
          content: [
            {
              type: 'image',
              image: new Uint8Array([0, 1, 2, 3]),
              mimeType: 'image/png',
            },
          ],
        },
      ],

      downloadImplementation: async ({ url }) => {
        throw new Error('Unexpected download call');
      },
    });

    expect(result).toEqual({
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'image',
              source: {
                data: 'AAECAw==',
                media_type: 'image/png',
                type: 'base64',
              },
            },
          ],
        },
      ],
      system: undefined,
    });
  });
});

describe('tool messages', () => {
  it('should convert a single tool result into an anthropic user message', async () => {
    const result = await convertToAnthropicMessagesPrompt({
      prompt: [
        {
          role: 'tool',
          content: [
            {
              type: 'tool-result',
              toolName: 'tool-1',
              toolCallId: 'tool-call-1',
              result: { test: 'This is a tool message' },
            },
          ],
        },
      ],
    });

    expect(result).toEqual({
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'tool_result',
              tool_use_id: 'tool-call-1',
              is_error: undefined,
              content: JSON.stringify({ test: 'This is a tool message' }),
            },
          ],
        },
      ],
      system: undefined,
    });
  });

  it('should convert multiple tool results into an anthropic user message', async () => {
    const result = await convertToAnthropicMessagesPrompt({
      prompt: [
        {
          role: 'tool',
          content: [
            {
              type: 'tool-result',
              toolName: 'tool-1',
              toolCallId: 'tool-call-1',
              result: { test: 'This is a tool message' },
            },
            {
              type: 'tool-result',
              toolName: 'tool-2',
              toolCallId: 'tool-call-2',
              result: { something: 'else' },
            },
          ],
        },
      ],
    });

    expect(result).toEqual({
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'tool_result',
              tool_use_id: 'tool-call-1',
              is_error: undefined,
              content: JSON.stringify({ test: 'This is a tool message' }),
            },
            {
              type: 'tool_result',
              tool_use_id: 'tool-call-2',
              is_error: undefined,
              content: JSON.stringify({ something: 'else' }),
            },
          ],
        },
      ],
      system: undefined,
    });
  });
});