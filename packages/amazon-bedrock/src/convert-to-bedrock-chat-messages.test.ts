import { convertToBedrockChatMessages } from './convert-to-bedrock-chat-messages';

describe('user messages', () => {
  it('should convert messages with image parts to multiple parts', async () => {
    const result = convertToBedrockChatMessages([
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

    expect(result).toEqual([
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

  it('should convert messages with only a text part to a string content', async () => {
    const result = convertToBedrockChatMessages([
      {
        role: 'user',
        content: [{ type: 'text', text: 'Hello' }],
      },
    ]);

    expect(result).toEqual([{ role: 'user', content: [{ text: 'Hello' }] }]);
  });
});
