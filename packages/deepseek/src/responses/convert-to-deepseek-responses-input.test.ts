import {
  InvalidArgumentError,
  InvalidPromptError,
  NoSuchProviderReferenceError,
  UnsupportedFunctionalityError,
  type LanguageModelV4FilePart,
  type LanguageModelV4Prompt,
} from '@ai-sdk/provider';
import { describe, expect, it } from 'vitest';
import { convertToDeepSeekResponsesInput } from './convert-to-deepseek-responses-input';

describe('convertToDeepSeekResponsesInput', () => {
  it('should convert an empty prompt', async () => {
    const result = await convertToDeepSeekResponsesInput({
      prompt: [],
      providerOptionsName: 'deepseek',
    });

    expect(result).toMatchInlineSnapshot(`
      {
        "input": [],
        "inputWarnings": [],
      }
    `);
  });

  describe('system messages', () => {
    it('should preserve multiple system messages in order', async () => {
      const result = await convertToDeepSeekResponsesInput({
        prompt: [
          { role: 'system', content: 'You are a helpful assistant.' },
          { role: 'system', content: 'Be concise.' },
        ],
        providerOptionsName: 'deepseek',
      });

      expect(result).toMatchInlineSnapshot(`
        {
          "input": [
            {
              "content": "You are a helpful assistant.",
              "role": "system",
            },
            {
              "content": "Be concise.",
              "role": "system",
            },
          ],
          "inputWarnings": [],
        }
      `);
    });
  });

  describe('user messages', () => {
    it('should convert a single text part', async () => {
      const result = await convertToDeepSeekResponsesInput({
        prompt: [{ role: 'user', content: [{ type: 'text', text: 'Hello' }] }],
        providerOptionsName: 'deepseek',
      });

      expect(result).toMatchInlineSnapshot(`
        {
          "input": [
            {
              "content": [
                {
                  "text": "Hello",
                  "type": "input_text",
                },
              ],
              "role": "user",
            },
          ],
          "inputWarnings": [],
        }
      `);
    });

    it('should preserve multiple text parts including empty text', async () => {
      const result = await convertToDeepSeekResponsesInput({
        prompt: [
          {
            role: 'user',
            content: [
              { type: 'text', text: 'Hello ' },
              { type: 'text', text: '' },
              { type: 'text', text: 'world' },
            ],
          },
        ],
        providerOptionsName: 'deepseek',
      });

      expect(result).toMatchInlineSnapshot(`
        {
          "input": [
            {
              "content": [
                {
                  "text": "Hello ",
                  "type": "input_text",
                },
                {
                  "text": "",
                  "type": "input_text",
                },
                {
                  "text": "world",
                  "type": "input_text",
                },
              ],
              "role": "user",
            },
          ],
          "inputWarnings": [],
        }
      `);
    });

    it.each(['image/png', 'image', 'image/*'])(
      'should preserve text and image URL order for %s',
      async mediaType => {
        const result = await convertToDeepSeekResponsesInput({
          prompt: [
            {
              role: 'user',
              content: [
                { type: 'text', text: 'Describe this image.' },
                {
                  type: 'file',
                  mediaType,
                  data: {
                    type: 'url',
                    url: new URL('https://example.com/image.png'),
                  },
                },
                { type: 'text', text: 'Be brief.' },
              ],
            },
          ],
          providerOptionsName: 'deepseek',
        });

        expect(result).toMatchInlineSnapshot(`
          {
            "input": [
              {
                "content": [
                  {
                    "text": "Describe this image.",
                    "type": "input_text",
                  },
                  {
                    "image_url": "https://example.com/image.png",
                    "type": "input_image",
                  },
                  {
                    "text": "Be brief.",
                    "type": "input_text",
                  },
                ],
                "role": "user",
              },
            ],
            "inputWarnings": [],
          }
        `);
      },
    );

    it.each([
      { name: 'base64', data: 'AQID' },
      { name: 'Uint8Array', data: new Uint8Array([1, 2, 3]) },
    ])('should convert an inline image from $name', async ({ data }) => {
      const result = await convertToDeepSeekResponsesInput({
        prompt: [
          {
            role: 'user',
            content: [
              {
                type: 'file',
                mediaType: 'image/png',
                data: { type: 'data', data },
              },
            ],
          },
        ],
        providerOptionsName: 'deepseek',
      });

      expect(result).toMatchInlineSnapshot(`
        {
          "input": [
            {
              "content": [
                {
                  "image_url": "data:image/png;base64,AQID",
                  "type": "input_image",
                },
              ],
              "role": "user",
            },
          ],
          "inputWarnings": [],
        }
      `);
    });

    it.each([
      ['image/jpeg', 'data:image/jpeg;base64,AQID'],
      ['image/jpg', 'data:image/jpeg;base64,AQID'],
      ['image/png', 'data:image/png;base64,AQID'],
      ['image/gif', 'data:image/gif;base64,AQID'],
      ['image/webp', 'data:image/webp;base64,AQID'],
    ])('should support %s inline images', async (mediaType, imageUrl) => {
      const result = await convertToDeepSeekResponsesInput({
        prompt: [
          {
            role: 'user',
            content: [
              { type: 'file', mediaType, data: { type: 'data', data: 'AQID' } },
            ],
          },
        ],
        providerOptionsName: 'deepseek',
      });

      expect(result).toEqual({
        input: [
          {
            role: 'user',
            content: [{ type: 'input_image', image_url: imageUrl }],
          },
        ],
        inputWarnings: [],
      });
    });

    it.each(['image', 'image/*'])(
      'should detect the image subtype for %s inline data',
      async mediaType => {
        const result = await convertToDeepSeekResponsesInput({
          prompt: [
            {
              role: 'user',
              content: [
                {
                  type: 'file',
                  mediaType,
                  data: {
                    type: 'data',
                    data: new Uint8Array([
                      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
                    ]),
                  },
                },
              ],
            },
          ],
          providerOptionsName: 'deepseek',
        });

        expect(result).toMatchInlineSnapshot(`
          {
            "input": [
              {
                "content": [
                  {
                    "image_url": "data:image/png;base64,iVBORw0KGgo=",
                    "type": "input_image",
                  },
                ],
                "role": "user",
              },
            ],
            "inputWarnings": [],
          }
        `);
      },
    );

    it.each(['image', 'image/*'])(
      'should reject %s inline data whose subtype cannot be detected',
      async mediaType => {
        await expect(
          convertToDeepSeekResponsesInput({
            prompt: [
              {
                role: 'user',
                content: [
                  {
                    type: 'file',
                    mediaType,
                    data: { type: 'data', data: 'AQID' },
                  },
                ],
              },
            ],
            providerOptionsName: 'deepseek',
          }),
        ).rejects.toThrow(UnsupportedFunctionalityError);
      },
    );

    it.each(['image/svg+xml', 'image/tiff'])(
      'should reject unsupported inline image format %s',
      async mediaType => {
        await expect(
          convertToDeepSeekResponsesInput({
            prompt: [
              {
                role: 'user',
                content: [
                  {
                    type: 'file',
                    mediaType,
                    data: { type: 'data', data: 'AQID' },
                  },
                ],
              },
            ],
            providerOptionsName: 'deepseek',
          }),
        ).rejects.toThrow(
          'DeepSeek supports JPEG, PNG, GIF, and WebP image inputs.',
        );
      },
    );

    it.each(['deepseek', 'custom'])(
      'should resolve DeepSeek image references with providerOptionsName %s',
      async providerOptionsName => {
        const result = await convertToDeepSeekResponsesInput({
          prompt: [
            {
              role: 'user',
              content: [
                {
                  type: 'file',
                  mediaType: 'image/png',
                  data: {
                    type: 'reference',
                    reference: { deepseek: 'file-image', openai: 'file-other' },
                  },
                },
              ],
            },
          ],
          providerOptionsName,
        });

        expect(result).toMatchInlineSnapshot(`
          {
            "input": [
              {
                "content": [
                  {
                    "file_id": "file-image",
                    "type": "input_image",
                  },
                ],
                "role": "user",
              },
            ],
            "inputWarnings": [],
          }
        `);
      },
    );

    it('should reject image references without a DeepSeek identifier', async () => {
      await expect(
        convertToDeepSeekResponsesInput({
          prompt: [
            {
              role: 'user',
              content: [
                {
                  type: 'file',
                  mediaType: 'image/png',
                  data: {
                    type: 'reference',
                    reference: { openai: 'file-other' },
                  },
                },
              ],
            },
          ],
          providerOptionsName: 'deepseek',
        }),
      ).rejects.toThrow(NoSuchProviderReferenceError);
    });

    it.each(['low', 'high', 'original', 'auto'])(
      'should forward imageDetail %s for URL and inline images',
      async imageDetail => {
        const result = await convertToDeepSeekResponsesInput({
          prompt: [
            {
              role: 'user',
              content: [
                {
                  type: 'file',
                  mediaType: 'image/png',
                  data: {
                    type: 'url',
                    url: new URL('https://example.com/image.png'),
                  },
                  providerOptions: { deepseek: { imageDetail } },
                },
                {
                  type: 'file',
                  mediaType: 'image/png',
                  data: { type: 'data', data: 'AQID' },
                  providerOptions: { deepseek: { imageDetail } },
                },
              ],
            },
          ],
          providerOptionsName: 'deepseek',
        });

        expect(result).toEqual({
          input: [
            {
              role: 'user',
              content: [
                {
                  type: 'input_image',
                  image_url: 'https://example.com/image.png',
                  detail: imageDetail,
                },
                {
                  type: 'input_image',
                  image_url: 'data:image/png;base64,AQID',
                  detail: imageDetail,
                },
              ],
            },
          ],
          inputWarnings: [],
        });
      },
    );

    it('should read image options from the configured provider namespace', async () => {
      const result = await convertToDeepSeekResponsesInput({
        prompt: [
          {
            role: 'user',
            content: [
              {
                type: 'file',
                mediaType: 'image/png',
                data: { type: 'data', data: 'AQID' },
                providerOptions: {
                  custom: { imageDetail: 'low' },
                  deepseek: { imageDetail: 'high' },
                },
              },
            ],
          },
        ],
        providerOptionsName: 'custom',
      });

      expect(result).toMatchInlineSnapshot(`
        {
          "input": [
            {
              "content": [
                {
                  "detail": "low",
                  "image_url": "data:image/png;base64,AQID",
                  "type": "input_image",
                },
              ],
              "role": "user",
            },
          ],
          "inputWarnings": [],
        }
      `);
    });

    it('should reject invalid image provider options', async () => {
      await expect(
        convertToDeepSeekResponsesInput({
          prompt: [
            {
              role: 'user',
              content: [
                {
                  type: 'file',
                  mediaType: 'image/png',
                  data: { type: 'data', data: 'AQID' },
                  providerOptions: { deepseek: { imageDetail: 'invalid' } },
                },
              ],
            },
          ],
          providerOptionsName: 'deepseek',
        }),
      ).rejects.toThrow(InvalidArgumentError);
    });

    it('should reject fileData image parts', async () => {
      await expect(
        convertToDeepSeekResponsesInput({
          prompt: [
            {
              role: 'user',
              content: [
                {
                  type: 'file',
                  mediaType: 'image/png',
                  data: { type: 'data', data: 'AQID' },
                  providerOptions: { deepseek: { fileData: true } },
                },
              ],
            },
          ],
          providerOptionsName: 'deepseek',
        }),
      ).rejects.toThrow(
        'DeepSeek `fileData` image parts with the Responses API',
      );
    });

    it('should accept image URLs at the 8192 character limit', async () => {
      const url = new URL(`https://example.com/${'a'.repeat(8192 - 20)}`);
      const result = await convertToDeepSeekResponsesInput({
        prompt: [
          {
            role: 'user',
            content: [
              {
                type: 'file',
                mediaType: 'image/png',
                data: { type: 'url', url },
              },
            ],
          },
        ],
        providerOptionsName: 'deepseek',
      });

      expect(url.toString()).toHaveLength(8192);
      expect(result).toEqual({
        input: [
          {
            role: 'user',
            content: [{ type: 'input_image', image_url: url.toString() }],
          },
        ],
        inputWarnings: [],
      });
    });

    it('should reject image URLs longer than 8192 characters', async () => {
      const prompt: LanguageModelV4Prompt = [
        {
          role: 'user',
          content: [
            {
              type: 'file',
              mediaType: 'image/png',
              data: {
                type: 'url',
                url: new URL(`https://example.com/${'a'.repeat(8193 - 20)}`),
              },
            },
          ],
        },
      ];

      await expect(
        convertToDeepSeekResponsesInput({
          prompt,
          providerOptionsName: 'deepseek',
        }),
      ).rejects.toThrow(
        new InvalidPromptError({
          prompt,
          message: 'DeepSeek image URLs must not exceed 8192 characters.',
        }),
      );
    });

    it.each([
      {
        mediaType: 'application/pdf',
        data: { type: 'url', url: new URL('https://example.com/document.pdf') },
      },
      { mediaType: 'audio/wav', data: { type: 'data', data: 'AQID' } },
      { mediaType: 'text/plain', data: { type: 'text', text: 'document' } },
      {
        mediaType: 'image/png',
        data: { type: 'text', text: 'not image bytes' },
      },
    ] satisfies Array<Omit<LanguageModelV4FilePart, 'type'>>)(
      'should warn and skip unsupported $mediaType $data.type file parts',
      async part => {
        const result = await convertToDeepSeekResponsesInput({
          prompt: [
            {
              role: 'user',
              content: [
                { type: 'text', text: 'Before' },
                { type: 'file', ...part },
                { type: 'text', text: 'After' },
              ],
            },
          ],
          providerOptionsName: 'deepseek',
        });

        expect(result).toMatchInlineSnapshot(`
          {
            "input": [
              {
                "content": [
                  {
                    "text": "Before",
                    "type": "input_text",
                  },
                  {
                    "text": "After",
                    "type": "input_text",
                  },
                ],
                "role": "user",
              },
            ],
            "inputWarnings": [
              {
                "feature": "user message part type: file",
                "type": "unsupported",
              },
            ],
          }
        `);
      },
    );
  });

  describe('assistant messages', () => {
    it('should preserve multiple text parts and omit empty text', async () => {
      const result = await convertToDeepSeekResponsesInput({
        prompt: [
          {
            role: 'assistant',
            content: [
              { type: 'text', text: 'Hello' },
              { type: 'text', text: '' },
              { type: 'text', text: 'World' },
            ],
          },
        ],
        providerOptionsName: 'deepseek',
      });

      expect(result).toMatchInlineSnapshot(`
        {
          "input": [
            {
              "content": "Hello",
              "role": "assistant",
            },
            {
              "content": "World",
              "role": "assistant",
            },
          ],
          "inputWarnings": [],
        }
      `);
    });

    it('should convert reasoning without provider metadata', async () => {
      const result = await convertToDeepSeekResponsesInput({
        prompt: [
          {
            role: 'assistant',
            content: [{ type: 'reasoning', text: 'Let me think.' }],
          },
        ],
        providerOptionsName: 'deepseek',
      });

      expect(result).toMatchInlineSnapshot(`
        {
          "input": [
            {
              "content": [
                {
                  "text": "Let me think.",
                  "type": "reasoning_text",
                },
              ],
              "type": "reasoning",
            },
          ],
          "inputWarnings": [],
        }
      `);
    });

    it.each(['deepseek', 'custom'])(
      'should preserve reasoning item IDs from providerOptionsName %s',
      async providerOptionsName => {
        const result = await convertToDeepSeekResponsesInput({
          prompt: [
            {
              role: 'assistant',
              content: [
                {
                  type: 'reasoning',
                  text: 'Let me think.',
                  providerOptions: {
                    [providerOptionsName]: { itemId: 'rs_1' },
                    other: { itemId: 'wrong-id' },
                  },
                },
              ],
            },
          ],
          providerOptionsName,
        });

        expect(result).toMatchInlineSnapshot(`
          {
            "input": [
              {
                "content": [
                  {
                    "text": "Let me think.",
                    "type": "reasoning_text",
                  },
                ],
                "id": "rs_1",
                "type": "reasoning",
              },
            ],
            "inputWarnings": [],
          }
        `);
      },
    );

    it.each([null, 123, false, [], {}].map(itemId => ({ itemId })))(
      'should omit a non-string reasoning item ID: $itemId',
      async ({ itemId }) => {
        const result = await convertToDeepSeekResponsesInput({
          prompt: [
            {
              role: 'assistant',
              content: [
                {
                  type: 'reasoning',
                  text: 'Let me think.',
                  providerOptions: { deepseek: { itemId } },
                },
              ],
            },
          ],
          providerOptionsName: 'deepseek',
        });

        expect(result).toMatchInlineSnapshot(`
          {
            "input": [
              {
                "content": [
                  {
                    "text": "Let me think.",
                    "type": "reasoning_text",
                  },
                ],
                "type": "reasoning",
              },
            ],
            "inputWarnings": [],
          }
        `);
      },
    );

    it('should preserve interleaved reasoning, text, and multiple function calls', async () => {
      const result = await convertToDeepSeekResponsesInput({
        prompt: [
          {
            role: 'assistant',
            content: [
              { type: 'reasoning', text: 'I should check the weather.' },
              { type: 'text', text: 'Checking now.' },
              {
                type: 'tool-call',
                toolCallId: 'call_1',
                toolName: 'weather',
                input: { location: 'Paris' },
              },
              {
                type: 'tool-call',
                toolCallId: 'call_2',
                toolName: 'weather',
                input: { location: 'London' },
              },
              { type: 'text', text: 'Waiting for the results.' },
            ],
          },
        ],
        providerOptionsName: 'deepseek',
      });

      expect(result).toMatchInlineSnapshot(`
        {
          "input": [
            {
              "content": [
                {
                  "text": "I should check the weather.",
                  "type": "reasoning_text",
                },
              ],
              "type": "reasoning",
            },
            {
              "content": "Checking now.",
              "role": "assistant",
            },
            {
              "arguments": "{"location":"Paris"}",
              "call_id": "call_1",
              "name": "weather",
              "type": "function_call",
            },
            {
              "arguments": "{"location":"London"}",
              "call_id": "call_2",
              "name": "weather",
              "type": "function_call",
            },
            {
              "content": "Waiting for the results.",
              "role": "assistant",
            },
          ],
          "inputWarnings": [],
        }
      `);
    });

    it('should preserve string tool arguments without double encoding', async () => {
      const result = await convertToDeepSeekResponsesInput({
        prompt: [
          {
            role: 'assistant',
            content: [
              {
                type: 'tool-call',
                toolCallId: 'call_1',
                toolName: 'weather',
                input: '{ "location": "Paris" }',
              },
            ],
          },
        ],
        providerOptionsName: 'deepseek',
      });

      expect(result).toMatchInlineSnapshot(`
        {
          "input": [
            {
              "arguments": "{ "location": "Paris" }",
              "call_id": "call_1",
              "name": "weather",
              "type": "function_call",
            },
          ],
          "inputWarnings": [],
        }
      `);
    });

    it('should treat client tools named web_search as function calls', async () => {
      const result = await convertToDeepSeekResponsesInput({
        prompt: [
          {
            role: 'assistant',
            content: [
              {
                type: 'tool-call',
                toolCallId: 'call_1',
                toolName: 'web_search',
                input: { query: 'weather' },
                providerExecuted: false,
              },
            ],
          },
        ],
        providerOptionsName: 'deepseek',
      });

      expect(result).toMatchInlineSnapshot(`
        {
          "input": [
            {
              "arguments": "{"query":"weather"}",
              "call_id": "call_1",
              "name": "web_search",
              "type": "function_call",
            },
          ],
          "inputWarnings": [],
        }
      `);
    });

    it.each(['deepseek', 'custom'])(
      'should replay a web search call from providerOptionsName %s and skip its result',
      async providerOptionsName => {
        const result = await convertToDeepSeekResponsesInput({
          prompt: [
            {
              role: 'assistant',
              content: [
                {
                  type: 'tool-call',
                  toolCallId: 'ws_1',
                  toolName: 'search',
                  input: {},
                  providerExecuted: true,
                  providerOptions: {
                    [providerOptionsName]: {
                      webSearchCall: {
                        type: 'web_search_call',
                        id: 'ws_1',
                        status: 'completed',
                        action: { type: 'search', queries: ['Paris weather'] },
                      },
                    },
                  },
                },
                {
                  type: 'tool-result',
                  toolCallId: 'ws_1',
                  toolName: 'search',
                  output: { type: 'json', value: { status: 'completed' } },
                },
                { type: 'text', text: 'It is sunny.' },
              ],
            },
          ],
          providerOptionsName,
        });

        expect(result).toMatchInlineSnapshot(`
          {
            "input": [
              {
                "action": {
                  "queries": [
                    "Paris weather",
                  ],
                  "type": "search",
                },
                "id": "ws_1",
                "status": "completed",
                "type": "web_search_call",
              },
              {
                "content": "It is sunny.",
                "role": "assistant",
              },
            ],
            "inputWarnings": [],
          }
        `);
      },
    );

    it.each(
      [null, 'invalid', [], {}, { type: 'function_call' }].map(
        webSearchCall => ({
          webSearchCall,
        }),
      ),
    )(
      'should skip provider-executed calls with invalid web search metadata: $webSearchCall',
      async ({ webSearchCall }) => {
        const result = await convertToDeepSeekResponsesInput({
          prompt: [
            {
              role: 'assistant',
              content: [
                {
                  type: 'tool-call',
                  toolCallId: 'ws_1',
                  toolName: 'web_search',
                  input: {},
                  providerExecuted: true,
                  providerOptions: { deepseek: { webSearchCall } },
                },
              ],
            },
          ],
          providerOptionsName: 'deepseek',
        });

        expect(result).toMatchInlineSnapshot(`
          {
            "input": [],
            "inputWarnings": [],
          }
        `);
      },
    );

    it('should skip provider-executed calls without saved metadata', async () => {
      const result = await convertToDeepSeekResponsesInput({
        prompt: [
          {
            role: 'assistant',
            content: [
              {
                type: 'tool-call',
                toolCallId: 'ws_1',
                toolName: 'web_search',
                input: {},
                providerExecuted: true,
              },
            ],
          },
        ],
        providerOptionsName: 'deepseek',
      });

      expect(result).toMatchInlineSnapshot(`
        {
          "input": [],
          "inputWarnings": [],
        }
      `);
    });

    it('should warn and skip unsupported assistant content', async () => {
      const result = await convertToDeepSeekResponsesInput({
        prompt: [
          {
            role: 'assistant',
            content: [
              {
                type: 'file',
                mediaType: 'image/png',
                data: { type: 'data', data: 'AQID' },
              },
              {
                type: 'reasoning-file',
                mediaType: 'image/png',
                data: { type: 'data', data: 'AQID' },
              },
              { type: 'custom', kind: 'other.custom' },
              { type: 'text', text: 'Hello' },
            ],
          },
        ],
        providerOptionsName: 'deepseek',
      });

      expect(result).toMatchInlineSnapshot(`
        {
          "input": [
            {
              "content": "Hello",
              "role": "assistant",
            },
          ],
          "inputWarnings": [
            {
              "feature": "assistant message part type: file",
              "type": "unsupported",
            },
            {
              "feature": "assistant message part type: reasoning-file",
              "type": "unsupported",
            },
            {
              "feature": "assistant message part type: custom",
              "type": "unsupported",
            },
          ],
        }
      `);
    });
  });

  describe('tool messages', () => {
    it.each(['text', 'error-text'] as const)(
      'should convert %s output',
      async type => {
        const result = await convertToDeepSeekResponsesInput({
          prompt: [
            {
              role: 'tool',
              content: [
                {
                  type: 'tool-result',
                  toolCallId: 'call_1',
                  toolName: 'weather',
                  output: { type, value: 'Weather report' },
                },
              ],
            },
          ],
          providerOptionsName: 'deepseek',
        });

        expect(result).toMatchInlineSnapshot(`
          {
            "input": [
              {
                "call_id": "call_1",
                "output": "Weather report",
                "type": "function_call_output",
              },
            ],
            "inputWarnings": [],
          }
        `);
      },
    );

    it.each(['json', 'error-json'] as const)(
      'should convert %s output',
      async type => {
        const result = await convertToDeepSeekResponsesInput({
          prompt: [
            {
              role: 'tool',
              content: [
                {
                  type: 'tool-result',
                  toolCallId: 'call_1',
                  toolName: 'weather',
                  output: { type, value: { temperature: 20 } },
                },
              ],
            },
          ],
          providerOptionsName: 'deepseek',
        });

        expect(result).toMatchInlineSnapshot(`
          {
            "input": [
              {
                "call_id": "call_1",
                "output": "{"temperature":20}",
                "type": "function_call_output",
              },
            ],
            "inputWarnings": [],
          }
        `);
      },
    );

    it.each([
      { reason: undefined, expected: 'Tool call execution denied.' },
      { reason: 'User declined.', expected: 'User declined.' },
      { reason: '', expected: '' },
    ])(
      'should convert execution-denied output with reason $reason',
      async ({ reason, expected }) => {
        const result = await convertToDeepSeekResponsesInput({
          prompt: [
            {
              role: 'tool',
              content: [
                {
                  type: 'tool-result',
                  toolCallId: 'call_1',
                  toolName: 'weather',
                  output: { type: 'execution-denied', reason },
                },
              ],
            },
          ],
          providerOptionsName: 'deepseek',
        });

        expect(result).toEqual({
          input: [
            {
              type: 'function_call_output',
              call_id: 'call_1',
              output: expected,
            },
          ],
          inputWarnings: [],
        });
      },
    );

    it.each(['deepseek', 'custom'])(
      'should preserve text, inline images, URLs, and references with providerOptionsName %s',
      async providerOptionsName => {
        const result = await convertToDeepSeekResponsesInput({
          prompt: [
            {
              role: 'tool',
              content: [
                {
                  type: 'tool-result',
                  toolCallId: 'call_1',
                  toolName: 'inspect',
                  output: {
                    type: 'content',
                    value: [
                      { type: 'text', text: 'Images:' },
                      {
                        type: 'file',
                        mediaType: 'image/png',
                        data: { type: 'data', data: 'AQID' },
                        providerOptions: {
                          [providerOptionsName]: { imageDetail: 'low' },
                        },
                      },
                      {
                        type: 'file',
                        mediaType: 'image',
                        data: {
                          type: 'url',
                          url: new URL('https://example.com/image.png'),
                        },
                        providerOptions: {
                          [providerOptionsName]: { imageDetail: 'high' },
                        },
                      },
                      {
                        type: 'file',
                        mediaType: 'image/png',
                        data: {
                          type: 'reference',
                          reference: { deepseek: 'file-image' },
                        },
                      },
                      { type: 'text', text: 'Done.' },
                    ],
                  },
                },
              ],
            },
          ],
          providerOptionsName,
        });

        expect(result).toMatchInlineSnapshot(`
          {
            "input": [
              {
                "call_id": "call_1",
                "output": [
                  {
                    "text": "Images:",
                    "type": "input_text",
                  },
                  {
                    "detail": "low",
                    "image_url": "data:image/png;base64,AQID",
                    "type": "input_image",
                  },
                  {
                    "detail": "high",
                    "image_url": "https://example.com/image.png",
                    "type": "input_image",
                  },
                  {
                    "file_id": "file-image",
                    "type": "input_image",
                  },
                  {
                    "text": "Done.",
                    "type": "input_text",
                  },
                ],
                "type": "function_call_output",
              },
            ],
            "inputWarnings": [],
          }
        `);
      },
    );

    it('should warn and skip unsupported tool result content parts', async () => {
      const result = await convertToDeepSeekResponsesInput({
        prompt: [
          {
            role: 'tool',
            content: [
              {
                type: 'tool-result',
                toolCallId: 'call_1',
                toolName: 'read',
                output: {
                  type: 'content',
                  value: [
                    {
                      type: 'file',
                      mediaType: 'application/pdf',
                      data: {
                        type: 'url',
                        url: new URL('https://example.com/document.pdf'),
                      },
                    },
                    {
                      type: 'file',
                      mediaType: 'image/png',
                      data: { type: 'text', text: 'not image bytes' },
                    },
                    {
                      type: 'custom',
                      providerOptions: { other: { value: 'custom' } },
                    },
                    { type: 'text', text: 'Supported content.' },
                  ],
                },
              },
            ],
          },
        ],
        providerOptionsName: 'deepseek',
      });

      expect(result).toMatchInlineSnapshot(`
        {
          "input": [
            {
              "call_id": "call_1",
              "output": [
                {
                  "text": "Supported content.",
                  "type": "input_text",
                },
              ],
              "type": "function_call_output",
            },
          ],
          "inputWarnings": [
            {
              "feature": "tool result content part type: file",
              "type": "unsupported",
            },
            {
              "feature": "tool result content part type: file",
              "type": "unsupported",
            },
            {
              "feature": "tool result content part type: custom",
              "type": "unsupported",
            },
          ],
        }
      `);
    });

    it('should preserve multiple results and skip approval responses', async () => {
      const result = await convertToDeepSeekResponsesInput({
        prompt: [
          {
            role: 'tool',
            content: [
              {
                type: 'tool-approval-response',
                approvalId: 'approval_1',
                approved: true,
              },
              {
                type: 'tool-result',
                toolCallId: 'call_1',
                toolName: 'weather',
                output: { type: 'text', value: 'Sunny' },
              },
              {
                type: 'tool-approval-response',
                approvalId: 'approval_2',
                approved: false,
                reason: 'Declined',
              },
              {
                type: 'tool-result',
                toolCallId: 'call_2',
                toolName: 'weather',
                output: { type: 'json', value: { temperature: 20 } },
              },
            ],
          },
        ],
        providerOptionsName: 'deepseek',
      });

      expect(result).toMatchInlineSnapshot(`
        {
          "input": [
            {
              "call_id": "call_1",
              "output": "Sunny",
              "type": "function_call_output",
            },
            {
              "call_id": "call_2",
              "output": "{"temperature":20}",
              "type": "function_call_output",
            },
          ],
          "inputWarnings": [],
        }
      `);
    });
  });

  describe('multi-turn conversations', () => {
    it('should preserve a full conversation with reasoning and a tool roundtrip', async () => {
      const result = await convertToDeepSeekResponsesInput({
        prompt: [
          { role: 'system', content: 'You are a helpful assistant.' },
          {
            role: 'user',
            content: [{ type: 'text', text: 'What is the weather in Paris?' }],
          },
          {
            role: 'assistant',
            content: [
              {
                type: 'reasoning',
                text: 'I need the current weather.',
                providerOptions: { deepseek: { itemId: 'rs_1' } },
              },
              {
                type: 'tool-call',
                toolCallId: 'call_1',
                toolName: 'weather',
                input: { location: 'Paris' },
              },
            ],
          },
          {
            role: 'tool',
            content: [
              {
                type: 'tool-result',
                toolCallId: 'call_1',
                toolName: 'weather',
                output: { type: 'json', value: { temperature: 20 } },
              },
            ],
          },
          {
            role: 'assistant',
            content: [{ type: 'text', text: 'It is 20 degrees in Paris.' }],
          },
          { role: 'user', content: [{ type: 'text', text: 'And in London?' }] },
        ],
        providerOptionsName: 'deepseek',
      });

      expect(result).toMatchInlineSnapshot(`
        {
          "input": [
            {
              "content": "You are a helpful assistant.",
              "role": "system",
            },
            {
              "content": [
                {
                  "text": "What is the weather in Paris?",
                  "type": "input_text",
                },
              ],
              "role": "user",
            },
            {
              "content": [
                {
                  "text": "I need the current weather.",
                  "type": "reasoning_text",
                },
              ],
              "id": "rs_1",
              "type": "reasoning",
            },
            {
              "arguments": "{"location":"Paris"}",
              "call_id": "call_1",
              "name": "weather",
              "type": "function_call",
            },
            {
              "call_id": "call_1",
              "output": "{"temperature":20}",
              "type": "function_call_output",
            },
            {
              "content": "It is 20 degrees in Paris.",
              "role": "assistant",
            },
            {
              "content": [
                {
                  "text": "And in London?",
                  "type": "input_text",
                },
              ],
              "role": "user",
            },
          ],
          "inputWarnings": [],
        }
      `);
    });
  });
});
