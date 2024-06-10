import { convertToGoogleGenerativeAIMessages } from './convert-to-google-generative-ai-messages';

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

    expect(result).toEqual([
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
    ]);
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

      downloadImplementation: async ({ url }) => {
        throw new Error('Unexpected download call');
      },
    });

    expect(result).toEqual([
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
    ]);
  });
});
