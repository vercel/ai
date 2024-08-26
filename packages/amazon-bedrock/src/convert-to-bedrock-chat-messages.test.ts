import { convertToBedrockChatMessages } from './convert-to-bedrock-chat-messages';

describe('system messages', () => {
  it('should combine multiple leading system messages into a single system message', async () => {
    const { system } = convertToBedrockChatMessages([
      { role: 'system', content: 'Hello' },
      { role: 'system', content: 'World' },
    ]);

    expect(system).toEqual('Hello\nWorld');
  });

  it('should throw an error if a system message is provided after a non-system message', async () => {
    expect(() =>
      convertToBedrockChatMessages([
        { role: 'user', content: [{ type: 'text', text: 'Hello' }] },
        { role: 'system', content: 'World' },
      ]),
    ).toThrowError();
  });
});

describe('user messages', () => {
  it('should convert messages with image and text parts to multiple parts', async () => {
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
});
