import { convertToGoogleGenerativeAIMessages } from './convert-to-google-generative-ai-messages';

describe('system messages', () => {
  it('should store system message in system instruction', async () => {
    const result = convertToGoogleGenerativeAIMessages([
      { role: 'system', content: 'Test' },
    ]);

    expect(result).toEqual({
      systemInstruction: { parts: [{ text: 'Test' }] },
      contents: [],
    });
  });

  it('should throw error when there was already a user message', async () => {
    expect(() =>
      convertToGoogleGenerativeAIMessages([
        { role: 'user', content: [{ type: 'text', text: 'Test' }] },
        { role: 'system', content: 'Test' },
      ]),
    ).toThrow(
      'system messages are only supported at the beginning of the conversation',
    );
  });
});

describe('user messages', () => {
  it('should add image parts for UInt8Array images', async () => {
    const result = convertToGoogleGenerativeAIMessages([
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

  it('should add file parts for base64 encoded files', async () => {
    const result = convertToGoogleGenerativeAIMessages([
      {
        role: 'user',
        content: [{ type: 'file', data: 'AAECAw==', mimeType: 'image/png' }],
      },
    ]);

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

describe('tool messages', () => {
  it('should convert tool result messages to function responses', async () => {
    const result = convertToGoogleGenerativeAIMessages([
      {
        role: 'tool',
        content: [
          {
            type: 'tool-result',
            toolName: 'testFunction',
            toolCallId: 'testCallId',
            result: { someData: 'test result' },
          },
        ],
      },
    ]);

    expect(result).toEqual({
      systemInstruction: undefined,
      contents: [
        {
          role: 'user',
          parts: [
            {
              functionResponse: {
                name: 'testFunction',
                response: {
                  name: 'testFunction',
                  content: { someData: 'test result' },
                },
              },
            },
          ],
        },
      ],
    });
  });
});

describe('assistant messages', () => {
  it('should add PNG image parts for base64 encoded files', async () => {
    const result = convertToGoogleGenerativeAIMessages([
      {
        role: 'assistant',
        content: [{ type: 'file', data: 'AAECAw==', mimeType: 'image/png' }],
      },
    ]);

    expect(result).toEqual({
      systemInstruction: undefined,
      contents: [
        {
          role: 'model',
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

  it('should throw error for non-PNG images in assistant messages', async () => {
    expect(() =>
      convertToGoogleGenerativeAIMessages([
        {
          role: 'assistant',
          content: [{ type: 'file', data: 'AAECAw==', mimeType: 'image/jpeg' }],
        },
      ]),
    ).toThrow('Only PNG images are supported in assistant messages');
  });

  it('should throw error for URL file data in assistant messages', async () => {
    expect(() =>
      convertToGoogleGenerativeAIMessages([
        {
          role: 'assistant',
          content: [
            {
              type: 'file',
              data: new URL('https://example.com/image.png'),
              mimeType: 'image/png',
            },
          ],
        },
      ]),
    ).toThrow('File data URLs in assistant messages are not supported');
  });
});
