import { convertToGoogleGenerativeAIMessages } from './convert-to-google-generative-ai-messages';
import { describe, it, expect, vi } from 'vitest';

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
                  "id": "call1",
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
  it('should preserve original Google Cloud Storage file URIs', async () => {
    const result = convertToGoogleGenerativeAIMessages([
      {
        role: 'user',
        content: [
          {
            type: 'file',
            data: new URL('gs://my-bucket/folder/My File.pdf'),
            originalUrl: 'gs://my-bucket/folder/My File.pdf',
            mediaType: 'application/pdf',
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
              fileData: {
                mimeType: 'application/pdf',
                fileUri: 'gs://my-bucket/folder/My File.pdf',
              },
            },
          ],
        },
      ],
    });
  });

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

describe('video processing', () => {
  const youtubeUrl = new URL('https://www.youtube.com/watch?v=9hE5-98ZeCg');

  it('should set agentic media processing on url and inline video parts', async () => {
    const providerOptions = { google: { processing: 'agentic' } };
    const result = convertToGoogleGenerativeAIMessages([
      {
        role: 'user',
        content: [
          {
            type: 'file',
            data: youtubeUrl,
            mediaType: 'video/mp4',
            providerOptions,
          },
          {
            type: 'file',
            data: 'AAECAw==',
            mediaType: 'video/mp4',
            providerOptions,
          },
          { type: 'text', text: 'Summarize the videos.' },
        ],
      },
    ]);

    expect(result.contents[0].parts).toEqual([
      {
        fileData: { mimeType: 'video/mp4', fileUri: youtubeUrl.toString() },
        mediaProcessing: 'AGENTIC',
      },
      {
        inlineData: { mimeType: 'video/mp4', data: 'AAECAw==' },
        mediaProcessing: 'AGENTIC',
      },
      { text: 'Summarize the videos.' },
    ]);
  });

  it('should map static processing configuration to videoMetadata', async () => {
    const result = convertToGoogleGenerativeAIMessages([
      {
        role: 'user',
        content: [
          {
            type: 'file',
            data: 'AAECAw==',
            mediaType: 'video/mp4',
            providerOptions: {
              google: {
                processing: {
                  type: 'static',
                  startOffset: 0,
                  endOffset: 10.5,
                  fps: 0.5,
                },
              },
            },
          },
          {
            type: 'file',
            data: youtubeUrl,
            mediaType: 'video/mp4',
            providerOptions: { google: { processing: 'static' } },
          },
        ],
      },
    ]);

    expect(result.contents[0].parts).toEqual([
      {
        inlineData: { mimeType: 'video/mp4', data: 'AAECAw==' },
        mediaProcessing: 'STATIC',
        videoMetadata: { startOffset: '0s', endOffset: '10.5s', fps: 0.5 },
      },
      {
        fileData: { mimeType: 'video/mp4', fileUri: youtubeUrl.toString() },
        mediaProcessing: 'STATIC',
      },
    ]);
  });

  it('should ignore processing on non-video parts and leave unset video parts unchanged', async () => {
    const result = convertToGoogleGenerativeAIMessages([
      {
        role: 'user',
        content: [
          {
            type: 'file',
            data: 'AAECAw==',
            mediaType: 'image/png',
            providerOptions: { google: { processing: 'agentic' } },
          },
          { type: 'file', data: 'AAECAw==', mediaType: 'video/mp4' },
        ],
      },
    ]);

    expect(result.contents[0].parts).toEqual([
      { inlineData: { mimeType: 'image/png', data: 'AAECAw==' } },
      { inlineData: { mimeType: 'video/mp4', data: 'AAECAw==' } },
    ]);
  });

  it('should warn and drop invalid processing values', async () => {
    const onWarning = vi.fn();
    const result = convertToGoogleGenerativeAIMessages(
      [
        {
          role: 'user',
          content: [
            {
              type: 'file',
              data: 'AAECAw==',
              mediaType: 'video/mp4',
              providerOptions: { google: { processing: 'dynamic' } },
            },
          ],
        },
      ],
      { onWarning },
    );

    expect(result.contents[0].parts[0]).toEqual({
      inlineData: { mimeType: 'video/mp4', data: 'AAECAw==' },
    });
    expect(onWarning).toHaveBeenCalledWith({
      type: 'other',
      message: expect.stringContaining('providerOptions.google.processing'),
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
                id: 'testCallId',
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

  it('should convert media tool result into functionResponse with parts (new path)', async () => {
    const result = convertToGoogleGenerativeAIMessages(
      [
        {
          role: 'tool',
          content: [
            {
              type: 'tool-result',
              toolName: 'imageGenerator',
              toolCallId: 'testCallId',
              output: {
                type: 'content',
                value: [
                  {
                    type: 'media',
                    data: 'base64encodedimagedata',
                    mediaType: 'image/jpeg',
                  },
                ],
              },
            },
          ],
        },
      ],
      { supportsFunctionResponseParts: true },
    );

    expect(result).toMatchInlineSnapshot(`
      {
        "contents": [
          {
            "parts": [
              {
                "functionResponse": {
                  "id": "testCallId",
                  "name": "imageGenerator",
                  "parts": [
                    {
                      "inlineData": {
                        "data": "base64encodedimagedata",
                        "mimeType": "image/jpeg",
                      },
                    },
                  ],
                  "response": {
                    "content": "Tool executed successfully.",
                    "name": "imageGenerator",
                  },
                },
              },
            ],
            "role": "user",
          },
        ],
        "systemInstruction": undefined,
      }
    `);
  });

  it('should convert text + media tool result into functionResponse with parts (new path)', async () => {
    const result = convertToGoogleGenerativeAIMessages(
      [
        {
          role: 'tool',
          content: [
            {
              type: 'tool-result',
              toolName: 'imageGenerator',
              toolCallId: 'testCallId',
              output: {
                type: 'content',
                value: [
                  {
                    type: 'text',
                    text: 'Here is the generated image:',
                  },
                  {
                    type: 'media',
                    data: 'base64encodedimagedata',
                    mediaType: 'image/jpeg',
                  },
                ],
              },
            },
          ],
        },
      ],
      { supportsFunctionResponseParts: true },
    );

    expect(result).toMatchInlineSnapshot(`
      {
        "contents": [
          {
            "parts": [
              {
                "functionResponse": {
                  "id": "testCallId",
                  "name": "imageGenerator",
                  "parts": [
                    {
                      "inlineData": {
                        "data": "base64encodedimagedata",
                        "mimeType": "image/jpeg",
                      },
                    },
                  ],
                  "response": {
                    "content": "Here is the generated image:",
                    "name": "imageGenerator",
                  },
                },
              },
            ],
            "role": "user",
          },
        ],
        "systemInstruction": undefined,
      }
    `);
  });

  it('should convert tool result messages with content type using legacy path', async () => {
    const result = convertToGoogleGenerativeAIMessages(
      [
        {
          role: 'tool',
          content: [
            {
              type: 'tool-result',
              toolName: 'imageGenerator',
              toolCallId: 'testCallId',
              output: {
                type: 'content',
                value: [
                  {
                    type: 'text',
                    text: 'Here is the generated image:',
                  },
                  {
                    type: 'media',
                    data: 'base64encodedimagedata',
                    mediaType: 'image/jpeg',
                  },
                ],
              },
            },
          ],
        },
      ],
      { supportsFunctionResponseParts: false },
    );

    expect(result).toMatchInlineSnapshot(`
      {
        "contents": [
          {
            "parts": [
              {
                "functionResponse": {
                  "id": "testCallId",
                  "name": "imageGenerator",
                  "response": {
                    "content": "Here is the generated image:",
                    "name": "imageGenerator",
                  },
                },
              },
              {
                "inlineData": {
                  "data": "base64encodedimagedata",
                  "mimeType": "image/jpeg",
                },
              },
              {
                "text": "Tool executed successfully and returned this image as a response",
              },
            ],
            "role": "user",
          },
        ],
        "systemInstruction": undefined,
      }
    `);
  });
});

describe('parallel tool calls', () => {
  it('should include thought signature on functionCall when provided', async () => {
    const result = convertToGoogleGenerativeAIMessages([
      {
        role: 'assistant',
        content: [
          {
            type: 'tool-call',
            toolCallId: 'call1',
            toolName: 'checkweather',
            input: { city: 'paris' },
            providerOptions: { google: { thoughtSignature: 'sig_parallel' } },
          },
          {
            type: 'tool-call',
            toolCallId: 'call2',
            toolName: 'checkweather',
            input: { city: 'london' },
          },
        ],
      },
    ]);

    expect(result.contents[0].parts[0]).toEqual({
      functionCall: {
        id: 'call1',
        args: { city: 'paris' },
        name: 'checkweather',
      },
      thoughtSignature: 'sig_parallel',
    });

    expect(result.contents[0].parts[1]).toEqual({
      functionCall: {
        id: 'call2',
        args: { city: 'london' },
        name: 'checkweather',
      },
      thoughtSignature: undefined,
    });
  });
});

describe('tool results with thought signatures', () => {
  it('should include thought signature on functionCall but not on functionResponse', async () => {
    const result = convertToGoogleGenerativeAIMessages([
      {
        role: 'assistant',
        content: [
          {
            type: 'tool-call',
            toolCallId: 'call1',
            toolName: 'readdata',
            input: { userId: '123' },
            providerOptions: { google: { thoughtSignature: 'sig_original' } },
          },
        ],
      },
      {
        role: 'tool',
        content: [
          {
            type: 'tool-result',
            toolCallId: 'call1',
            toolName: 'readdata',
            output: {
              type: 'error-text',
              value: 'file not found',
            },
            providerOptions: { google: { thoughtSignature: 'sig_original' } },
          },
        ],
      },
    ]);

    expect(result.contents[0].parts[0]).toEqual({
      functionCall: {
        id: 'call1',
        args: { userId: '123' },
        name: 'readdata',
      },
      thoughtSignature: 'sig_original',
    });

    expect(result.contents[1].parts[0]).toEqual({
      functionResponse: {
        id: 'call1',
        name: 'readdata',
        response: {
          content: 'file not found',
          name: 'readdata',
        },
      },
    });

    expect(result.contents[1].parts[0]).not.toHaveProperty('thoughtSignature');
  });
});
