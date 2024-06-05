import { convertToAnthropicMessagesPrompt } from './convert-to-anthropic-messages-prompt';

describe('user messages', () => {
  it('should download images for user image parts with URLs', async () => {
    const result = await convertToAnthropicMessagesPrompt({
      prompt: [
        {
          role: 'user',
          content: [
            { type: 'text', text: 'Hello' },
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
            { type: 'text', text: 'Hello' },
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
