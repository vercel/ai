import { convertToBedrockChatMessages } from './convert-to-bedrock-chat-messages';

describe('user messages', () => {
  it('should convert messages with image parts to multiple parts', async () => {
    const { messages } = convertToBedrockChatMessages([
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
    ]);

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

  it('should extract the system message', async () => {
    const { system } = convertToBedrockChatMessages([
      {
        role: 'system',
        content: 'Hello',
      },
    ]);

    expect(system).toEqual('Hello');
  });

  it('should throw an error if multiple system messages are provided', async () => {
    expect(() =>
      convertToBedrockChatMessages([
        {
          role: 'system',
          content: 'Hello',
        },
        {
          role: 'system',
          content: 'World',
        },
      ]),
    ).toThrowError();
  });
});
