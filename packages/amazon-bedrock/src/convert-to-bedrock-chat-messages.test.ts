import { convertToBedrockChatMessages } from './convert-to-bedrock-chat-messages';

describe('user messages', () => {
  it('should convert messages with image and text parts to multiple parts', async () => {
    const { messages } = await convertToBedrockChatMessages({
      prompt: [
        {
          role: 'user',
          content: [
            { type: 'text', text: 'Hello' },
            {
              type: 'image',
              image: new Uint8Array([0, 1, 2, 3]),
              mimeType: 'image/png',
            },
          ],
        },
      ],
    });

    expect(messages).toEqual([
      {
        role: 'user',
        content: [
          { text: 'Hello' },
          {
            image: {
              format: 'png',
              source: { bytes: new Uint8Array([0, 1, 2, 3]) },
            },
          },
        ],
      },
    ]);
  });

  it('should download images for user image parts with URLs', async () => {
    const result = await convertToBedrockChatMessages({
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
              image: {
                format: 'png',
                source: { bytes: new Uint8Array([0, 1, 2, 3]) },
              },
            },
          ],
        },
      ],
      system: undefined,
    });
  });

  it('should extract the system message', async () => {
    const { system } = await convertToBedrockChatMessages({
      prompt: [
        {
          role: 'system',
          content: 'Hello',
        },
      ],
    });

    expect(system).toEqual('Hello');
  });

  it('should throw an error if multiple system messages are provided', async () => {
    expect(() =>
      convertToBedrockChatMessages({
        prompt: [
          {
            role: 'system',
            content: 'Hello',
          },
          {
            role: 'system',
            content: 'World',
          },
        ],
      }),
    ).rejects.toThrowError();
  });
});
