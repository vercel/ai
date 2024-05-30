import { convertToOpenAIChatMessages } from './convert-to-openai-chat-messages';

describe('user messages', () => {
  it('should convert messages with image parts to multiple parts', async () => {
    const result = convertToOpenAIChatMessages([
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
          { type: 'text', text: 'Hello' },
          {
            type: 'image_url',
            image_url: { url: 'data:image/png;base64,AAECAw==' },
          },
        ],
      },
    ]);
  });

  it('should convert messages with only a text part to a string content', async () => {
    const result = convertToOpenAIChatMessages([
      {
        role: 'user',
        content: [{ type: 'text', text: 'Hello' }],
      },
    ]);

    expect(result).toEqual([{ role: 'user', content: 'Hello' }]);
  });
});
