import { convertToGoogleVertexContentRequest } from './convert-to-google-vertex-content-request';

describe('user message', () => {
  it('should convert uint8 image parts', async () => {
    const result = convertToGoogleVertexContentRequest([
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
    ]);

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

  it('should throw an error for URL image parts', async () => {
    expect(() => {
      convertToGoogleVertexContentRequest([
        {
          role: 'user',
          content: [
            {
              type: 'image',
              image: new URL('https://example.com/image.png'),
            },
          ],
        },
      ]);
    }).toThrow('URL image parts');
  });
});

describe('assistant message', () => {
  it("should convert text parts that aren't empty", async () => {
    const result = convertToGoogleVertexContentRequest([
      {
        role: 'assistant',
        content: [
          {
            type: 'text',
            text: 'Hello, world!',
          },
        ],
      },
    ]);

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
    const result = convertToGoogleVertexContentRequest([
      {
        role: 'assistant',
        content: [
          {
            type: 'text',
            text: '',
          },
        ],
      },
    ]);

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
    const result = convertToGoogleVertexContentRequest([
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
    ]);

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
    const result = convertToGoogleVertexContentRequest([
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
    ]);

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
