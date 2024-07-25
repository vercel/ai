import { convertToGoogleVertexContentRequest } from './convert-to-google-vertex-content-request';

describe('system messages', () => {
  it('should store system message in system instruction', async () => {
    const result = convertToGoogleVertexContentRequest([
      { role: 'system', content: 'Test' },
    ]);

    expect(result).toEqual({
      systemInstruction: { role: 'system', parts: [{ text: 'Test' }] },
      contents: [],
    });
  });

  it('should throw error when there was already a user message', async () => {
    expect(() =>
      convertToGoogleVertexContentRequest([
        { role: 'user', content: [{ type: 'text', text: 'Test' }] },
        { role: 'system', content: 'Test' },
      ]),
    ).toThrow(
      "'system messages after first user message' functionality not supported.",
    );
  });
});

describe('user message', () => {
  it('should add image parts for UInt8Array images', async () => {
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
