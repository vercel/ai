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

describe('thought signatures', () => {
  it('should preserve thought signatures in assistant messages', async () => {
    const result = convertToGoogleGenerativeAIMessages([
      {
        role: 'assistant',
        content: [
          {
            type: 'text',
            text: 'Regular text',
            providerOptions: { google: { thoughtSignature: 'sig1' } },
          },
          {
            type: 'reasoning',
            text: 'Reasoning text',
            providerOptions: { google: { thoughtSignature: 'sig2' } },
          },
          {
            type: 'tool-call',
            toolCallId: 'call1',
            toolName: 'test',
            input: { value: 'test' },
            providerOptions: { google: { thoughtSignature: 'sig3' } },
          },
        ],
      },
    ]);

    expect(result).toMatchInlineSnapshot(`
      {
        "contents": [
          {
            "parts": [
              {
                "text": "Regular text",
                "thoughtSignature": "sig1",
              },
              {
                "text": "Reasoning text",
                "thought": true,
                "thoughtSignature": "sig2",
              },
              {
                "functionCall": {
                  "args": {
                    "value": "test",
                  },
                  "name": "test",
                },
                "thoughtSignature": "sig3",
              },
            ],
            "role": "model",
          },
        ],
        "systemInstruction": undefined,
      }
    `);
  });
});

describe('Gemma model system instructions', () => {
  it('should prepend system instruction to first user message for Gemma models', async () => {
    const result = convertToGoogleGenerativeAIMessages(
      [
        { role: 'system', content: 'You are a helpful assistant.' },
        { role: 'user', content: [{ type: 'text', text: 'Hello' }] },
      ],
      { isGemmaModel: true },
    );

    expect(result).toMatchInlineSnapshot(`
      {
        "contents": [
          {
            "parts": [
              {
                "text": "You are a helpful assistant.

      ",
              },
              {
                "text": "Hello",
              },
            ],
            "role": "user",
          },
        ],
        "systemInstruction": undefined,
      }
    `);
  });

  it('should handle multiple system messages for Gemma models', async () => {
    const result = convertToGoogleGenerativeAIMessages(
      [
        { role: 'system', content: 'You are helpful.' },
        { role: 'system', content: 'Be concise.' },
        { role: 'user', content: [{ type: 'text', text: 'Hi' }] },
      ],
      { isGemmaModel: true },
    );

    expect(result).toMatchInlineSnapshot(`
      {
        "contents": [
          {
            "parts": [
              {
                "text": "You are helpful.

      Be concise.

      ",
              },
              {
                "text": "Hi",
              },
            ],
            "role": "user",
          },
        ],
        "systemInstruction": undefined,
      }
    `);
  });

  it('should not affect non-Gemma models', async () => {
    const result = convertToGoogleGenerativeAIMessages(
      [
        { role: 'system', content: 'You are helpful.' },
        { role: 'user', content: [{ type: 'text', text: 'Hello' }] },
      ],
      { isGemmaModel: false },
    );

    expect(result).toMatchInlineSnapshot(`
      {
        "contents": [
          {
            "parts": [
              {
                "text": "Hello",
              },
            ],
            "role": "user",
          },
        ],
        "systemInstruction": {
          "parts": [
            {
              "text": "You are helpful.",
            },
          ],
        },
      }
    `);
  });

  it('should handle Gemma model with system instruction but no user messages', async () => {
    const result = convertToGoogleGenerativeAIMessages(
      [{ role: 'system', content: 'You are helpful.' }],
      { isGemmaModel: true },
    );

    expect(result).toMatchInlineSnapshot(`
      {
        "contents": [],
        "systemInstruction": undefined,
      }
    `);
  });
});

describe('user messages', () => {
  it('should add image parts', async () => {
    const result = convertToGoogleGenerativeAIMessages([
      {
        role: 'user',
        content: [
          {
            type: 'file',
            data: 'AAECAw==',
            mediaType: 'image/png',
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
        content: [{ type: 'file', data: 'AAECAw==', mediaType: 'image/png' }],
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
            output: { type: 'json', value: { someData: 'test result' } },
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
        content: [{ type: 'file', data: 'AAECAw==', mediaType: 'image/png' }],
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
          content: [
            { type: 'file', data: 'AAECAw==', mediaType: 'image/jpeg' },
          ],
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
              mediaType: 'image/png',
            },
          ],
        },
      ]),
    ).toThrow('File data URLs in assistant messages are not supported');
  });
});
