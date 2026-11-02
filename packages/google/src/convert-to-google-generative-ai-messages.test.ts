import { convertToGoogleGenerativeAIMessages } from './convert-to-google-generative-ai-messages';
import { describe, it, expect } from 'vitest';

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

  it('should parse JSON string input into args object for functionCall', async () => {
    const result = convertToGoogleGenerativeAIMessages([
      {
        role: 'assistant',
        content: [
          {
            type: 'tool-call',
            toolCallId: 'call1',
            toolName: 'checkweather',
            input: '{"city":"berlin","units":"metric"}',
          },
        ],
      },
    ]);

    expect(result.contents[0].parts[0]).toEqual({
      functionCall: {
        id: 'call1',
        args: { city: 'berlin', units: 'metric' },
        name: 'checkweather',
      },
      thoughtSignature: undefined,
    });
  });

  it('should handle circular references in tool-result without recursion error', async () => {
    const cyclicObj: any = { status: 'ok' };
    cyclicObj.self = cyclicObj;

    const result = convertToGoogleGenerativeAIMessages([
      {
        role: 'tool',
        content: [
          {
            type: 'tool-result',
            toolName: 'inspectData',
            toolCallId: 'call_cycle',
            output: { type: 'json', value: cyclicObj },
          },
        ],
      },
    ]);

    expect(result.contents[0].parts[0]).toEqual({
      functionResponse: {
        id: 'call_cycle',
        name: 'inspectData',
        response: {
          name: 'inspectData',
          content: { status: 'ok', self: '[Circular]' },
        },
      },
    });
  });

  it('should handle circular references and BigInt with $ref in tool-result safely', async () => {
    const cyclicSchema: any = {
      $ref: '#/components/schemas/Item',
      count: BigInt('100'),
    };
    cyclicSchema.self = cyclicSchema;

    const result = convertToGoogleGenerativeAIMessages([
      {
        role: 'tool',
        content: [
          {
            type: 'tool-result',
            toolName: 'getSchema',
            toolCallId: 'call_schema',
            output: { type: 'json', value: cyclicSchema },
          },
        ],
      },
    ]);

    const content = (result.contents[0].parts[0] as any).functionResponse
      .response.content;
    expect(content).toEqual({
      $ref: '#/components/schemas/Item',
      count: '100',
      self: '[Circular]',
    });
  });

  it('should preserve reused non-circular objects with $ref in tool-result', async () => {
    const shared: any = { id: 1 };
    const schema: any = {
      $ref: '#/components/schemas/Item',
      first: shared,
      second: shared,
    };

    const result = convertToGoogleGenerativeAIMessages([
      {
        role: 'tool',
        content: [
          {
            type: 'tool-result',
            toolName: 'getSchema',
            toolCallId: 'call_schema',
            output: { type: 'json', value: schema },
          },
        ],
      },
    ]);

    const content = (result.contents[0].parts[0] as any).functionResponse
      .response.content;
    expect(content).toEqual(schema);
    expect(content.first).toBe(content.second);
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

it.each(['{"city":', 'null'])(
  'retains malformed input or parsed null without throwing: %s',
  input => {
    const result = convertToGoogleGenerativeAIMessages([
      {
        role: 'assistant',
        content: [
          {
            type: 'tool-call',
            toolCallId: 'call1',
            toolName: 'weather',
            input,
          },
        ],
      },
    ]);
    expect((result.contents[0].parts[0] as any).functionCall.args).toBe(
      input === 'null' ? null : input,
    );
  },
);

it('keeps non-ref tool results JSON serializable with BigInt and cycles', () => {
  const value: any = { count: BigInt('42') };
  value.self = value;
  const result = convertToGoogleGenerativeAIMessages([
    {
      role: 'tool',
      content: [
        {
          type: 'tool-result',
          toolCallId: 'call1',
          toolName: 'inspect',
          output: { type: 'json', value },
        },
      ],
    },
  ]);
  expect(
    (result.contents[0].parts[0] as any).functionResponse.response.content,
  ).toEqual({ count: '42', self: '[Circular]' });
  expect(() => JSON.stringify(result)).not.toThrow();
});

it('serializes BigInt returned by toJSON in structured tool results', () => {
  const result = convertToGoogleGenerativeAIMessages([
    {
      role: 'tool',
      content: [
        {
          type: 'tool-result',
          toolCallId: 'call1',
          toolName: 'inspect',
          output: {
            type: 'json',
            value: { count: { toJSON: () => BigInt('42') } } as any,
          },
        },
      ],
    },
  ]);
  expect(
    (result.contents[0].parts[0] as any).functionResponse.response.content,
  ).toEqual({ count: '42' });
});
