import { convertToGoogleGenerativeAIMessages } from './convert-to-google-generative-ai-messages';

describe('system messages', () => {
  it('should store system message in system instruction', async () => {
    const result = await convertToGoogleGenerativeAIMessages({
      prompt: [{ role: 'system', content: 'Test' }],
    });

    expect(result).toEqual({
      systemInstruction: { parts: [{ text: 'Test' }] },
      contents: [],
    });
  });

  it('should throw error when there was already a user message', async () => {
    await expect(
      convertToGoogleGenerativeAIMessages({
        prompt: [
          { role: 'user', content: [{ type: 'text', text: 'Test' }] },
          { role: 'system', content: 'Test' },
        ],
      }),
    ).rejects.toThrow(
      'system messages are only supported at the beginning of the conversation',
    );
  });
});

describe('user messages', () => {
  it('should download images for user image parts with URLs', async () => {
    const result = await convertToGoogleGenerativeAIMessages({
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
      systemInstruction: undefined,
      contents: [
        {
          role: 'user',
          parts: [
            {
              inlineData: {
                data: 'AAECAw==',
                mimeType: 'image/png',
              },
            },
          ],
        },
      ],
    });
  });

  it('should add image parts for UInt8Array images', async () => {
    const result = await convertToGoogleGenerativeAIMessages({
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

      downloadImplementation: async () => {
        throw new Error('Unexpected download call');
      },
    });

    expect(result).toEqual({
      systemInstruction: undefined,
      contents: [
        {
          role: 'user',
          parts: [
            {
              inlineData: {
                data: 'AAECAw==',
                mimeType: 'image/png',
              },
            },
          ],
        },
      ],
    });
  });
});
