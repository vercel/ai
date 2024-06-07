import { convertToGoogleVertexContentRequest } from './convert-to-google-vertex-content-request';

describe('user message', () => {
  it('should download images for user image parts with URLs', async () => {
    const result = await convertToGoogleVertexContentRequest({
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
      contents: [
        {
          role: 'user',
          parts: [
            {
              inlineData: {
                mimeType: 'image/png',
                data: 'AAECAw==',
              },
            },
          ],
        },
      ],
    });
  });

  it('should add image parts for UInt8Array images', async () => {
    const result = await convertToGoogleVertexContentRequest({
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
      contents: [
        {
          role: 'user',
          parts: [
            {
              inlineData: {
                mimeType: 'image/png',
                data: 'AAECAw==',
              },
            },
          ],
        },
      ],
    });
  });
});

describe('assistant message', () => {
  it("should convert text parts that aren't empty", async () => {
    const result = await convertToGoogleVertexContentRequest({
      prompt: [
        {
          role: 'assistant',
          content: [
            {
              type: 'text',
              text: 'Hello, world!',
            },
          ],
        },
      ],
    });

    expect(result).toEqual({
      contents: [
        {
          role: 'assistant',
          parts: [
            {
              text: 'Hello, world!',
            },
          ],
        },
      ],
    });
  });

  it('should exclude text parts that are empty', async () => {
    const result = await convertToGoogleVertexContentRequest({
      prompt: [
        {
          role: 'assistant',
          content: [
            {
              type: 'text',
              text: '',
            },
          ],
        },
      ],
    });

    expect(result).toEqual({
      contents: [
        {
          role: 'assistant',
          parts: [],
        },
      ],
    });
  });

  it('should convert tool call parts', async () => {
    const result = await convertToGoogleVertexContentRequest({
      prompt: [
        {
          role: 'assistant',
          content: [
            {
              type: 'tool-call',
              toolName: 'tool',
              toolCallId: 'id',
              args: { arg: 'value' },
            },
          ],
        },
      ],
    });

    expect(result).toEqual({
      contents: [
        {
          role: 'assistant',
          parts: [
            {
              functionCall: {
                name: 'tool',
                args: { arg: 'value' },
              },
            },
          ],
        },
      ],
    });
  });
});

describe('tool message', () => {
  it('should convert tool response parts', async () => {
    const result = await convertToGoogleVertexContentRequest({
      prompt: [
        {
          role: 'tool',
          content: [
            {
              type: 'tool-result',
              toolName: 'tool',
              toolCallId: 'id',
              result: { result: 'value' },
            },
          ],
        },
      ],
    });

    expect(result).toEqual({
      contents: [
        {
          role: 'user',
          parts: [
            {
              functionResponse: {
                name: 'tool',
                response: { result: 'value' },
              },
            },
          ],
        },
      ],
    });
  });
});
